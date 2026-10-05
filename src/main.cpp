#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/hash_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/commands/memory_cmds.h"
#include "redisx/commands/persist_cmds.h"
#include "redisx/commands/repl_cmds.h"
#include "redisx/commands/set_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/commands/zset_cmds.h"
#include "redisx/core/logging.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/memory/accounting.h"
#include "redisx/memory/eviction.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/persistence/recovery.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replica_link.h"
#include "redisx/replication/replid.h"

#include <algorithm>
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>

static redisx::net::EventLoop *g_loop = nullptr;

static void signal_handler(int sig) {
    REDISX_LOG_INFO("Received signal %d, stopping server...", sig);
    if (g_loop) {
        g_loop->stop();
    }
}

static void print_help(const char *prog_name) {
    std::cout << "Usage: " << prog_name << " [OPTIONS]\n"
              << "Options:\n"
              << "  -p <port>         TCP port (default: 6379)\n"
              << "  -h <host>         Bind host IP (default: 127.0.0.1)\n"
              << "  --version         Output version information and exit\n"
              << "  --help            Output this help menu and exit\n";
}

int main(int argc, char *argv[]) {
    std::string host = "127.0.0.1";
    std::uint16_t port = 6379;

    for (int i = 1; i < argc; ++i) {
        std::string_view arg(argv[i]);
        if (arg == "--version") {
            std::cout << "redisx 0.1.0\n";
            return 0;
        }
        if (arg == "--help") {
            print_help(argv[0]);
            return 0;
        }
        if (arg == "-p" && i + 1 < argc) {
            port = static_cast<std::uint16_t>(std::atoi(argv[++i]));
        } else if (arg == "-h" && i + 1 < argc) {
            host = argv[++i];
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    REDISX_LOG_INFO("Starting RedisX server v0.1.0 (Stage 8 Replication)");

    redisx::net::EventLoop loop;
    g_loop = &loop;

    // Storage Keyspace, TTL Manager, Eviction Manager & Replication Context
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::memory::EvictionManager evict_mgr;
    redisx::commands::Dispatcher dispatcher;

    redisx::replication::ReplIdManager replid_mgr;
    redisx::replication::ReplBacklog backlog(1024 * 1024);
    redisx::replication::ReplStream repl_stream(replid_mgr, backlog);
    redisx::replication::ReplicaLink replica_link(loop, keyspace, dispatcher, ttl_mgr);

    redisx::commands::ReplicationContext repl_ctx{
        replid_mgr,
        backlog,
        repl_stream,
        replica_link,
        port
    };

    redisx::commands::register_expire_commands(dispatcher, ttl_mgr);
    redisx::commands::register_string_commands(dispatcher, ttl_mgr);
    redisx::commands::register_list_commands(dispatcher);
    redisx::commands::register_hash_commands(dispatcher);
    redisx::commands::register_set_commands(dispatcher);
    redisx::commands::register_zset_commands(dispatcher);
    redisx::commands::register_memory_commands(dispatcher, evict_mgr);
    redisx::commands::register_persist_commands(dispatcher);
    redisx::commands::register_repl_commands(dispatcher, repl_ctx);

    // Startup recovery (Load RDB snapshot and replay AOF log)
    auto recovery_res = redisx::persistence::RecoveryEngine::recover(keyspace, dispatcher, "dump.rdb", "appendonly.aof");
    if (recovery_res.is_error() && recovery_res.error() != redisx::core::ErrorCode::NotFound) {
        REDISX_LOG_ERROR("Startup recovery failed with error code: %d", static_cast<int>(recovery_res.error()));
        return 1;
    }

    // Track active database index per connection fd
    std::unordered_map<int, std::size_t> conn_db_map;

    // Register periodic idle timer for background incremental rehashing & active TTL expiration (every 100ms)
    loop.add_timer(100, [&keyspace, &ttl_mgr]() {
        keyspace.rehash_step_all(100);
        ttl_mgr.active_expire_cycle(keyspace, 1);
    });

    redisx::net::Listener listener(loop, host, port);

    std::unordered_map<int, std::uint16_t> conn_port_map;

    listener.set_new_connection_callback([&dispatcher, &keyspace, &conn_db_map, &conn_port_map, &evict_mgr, &ttl_mgr, &repl_stream, &replica_link](
                                               std::shared_ptr<redisx::net::Connection> conn) {
        auto &in_buf = conn->in_buffer();
        auto &out_buf = conn->out_buffer();
        int fd = conn->fd();

        if (conn_db_map.find(fd) == conn_db_map.end()) {
            conn_db_map[fd] = 0; // Default DB 0
            conn->set_close_callback([&conn_db_map, &conn_port_map, &repl_stream](std::shared_ptr<redisx::net::Connection> c) {
                conn_db_map.erase(c->fd());
                conn_port_map.erase(c->fd());
                repl_stream.remove_replica(c->fd());
            });
        }

        std::size_t active_db = conn_db_map[fd];

        while (in_buf.readable_bytes() > 0) {
            auto result = redisx::proto::RespReader::parse(in_buf);
            if (result.is_error()) {
                REDISX_LOG_WARN("Protocol error on fd %d, closing connection", fd);
                redisx::proto::RespWriter::write_error(
                    out_buf, "ERR Protocol error: invalid multibulk length or format");
                conn->close();
                break;
            }

            if (!result.value().has_value()) {
                break; // Incomplete command, wait for more data
            }

            const auto &cmd = result.value().value();
            std::string cmd_name = cmd.name_upper();

            if (cmd_name == "REPLCONF" && cmd.arg_count() >= 3) {
                std::string sub = cmd.arg(1);
                std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
                if (sub == "LISTENING-PORT") {
                    try {
                        conn_port_map[fd] = static_cast<std::uint16_t>(std::stoul(cmd.arg(2)));
                    } catch (...) {}
                } else if (sub == "ACK") {
                    try {
                        std::uint64_t ack_off = std::stoull(cmd.arg(2));
                        repl_stream.update_replica_ack(fd, ack_off, redisx::core::monotonic_now_ms());
                    } catch (...) {}
                }
            } else if (cmd_name == "PSYNC") {
                std::uint16_t repl_port = conn_port_map.count(fd) ? conn_port_map[fd] : 0;
                repl_stream.add_replica(conn, repl_port);
            }

            // Replicas in read-only mode reject client write commands
            const auto *spec = dispatcher.find_command(cmd_name);
            if (replica_link.is_replica_mode() && spec && (spec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                redisx::proto::RespWriter::write_error(out_buf, "READONLY You can't write against a read only replica.");
                break;
            }

            std::size_t out_db = active_db;
            dispatcher.dispatch(cmd, keyspace, active_db, out_buf, out_db, &evict_mgr, &ttl_mgr);

            // Propagate write commands to connected replicas
            if (spec && (spec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                repl_stream.propagate_command(cmd, keyspace, active_db);
            }

            active_db = out_db;
        }

        conn_db_map[fd] = active_db;
        conn->flush();
    });

    auto result = listener.start();
    if (result.is_error()) {
        REDISX_LOG_ERROR("Failed to start listener on %s:%u", host.c_str(), port);
        return 1;
    }

    REDISX_LOG_INFO("RedisX Stage 8 Server running on %s:%u", host.c_str(), port);
    loop.run();

    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}