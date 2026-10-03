#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/core/logging.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

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

    REDISX_LOG_INFO("Starting RedisX server v0.1.0 (Stage 4 Expiration Engine)");

    redisx::net::EventLoop loop;
    g_loop = &loop;

    // Stage 4 Storage Keyspace, TTL Manager & Command Dispatcher
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::commands::Dispatcher dispatcher;

    redisx::commands::register_expire_commands(dispatcher, ttl_mgr);
    redisx::commands::register_string_commands(dispatcher, ttl_mgr);

    // Track active database index per connection fd
    std::unordered_map<int, std::size_t> conn_db_map;

    // Register periodic idle timer for background incremental rehashing & active TTL expiration (every 100ms)
    loop.add_timer(100, [&keyspace, &ttl_mgr]() {
        keyspace.rehash_step_all(100);
        ttl_mgr.active_expire_cycle(keyspace, 1);
        return true; // Recurring timer
    });

    redisx::net::Listener listener(loop, host, port);

    listener.set_new_connection_callback([&dispatcher, &keyspace, &conn_db_map](
                                              std::shared_ptr<redisx::net::Connection> conn) {
        auto &in_buf = conn->in_buffer();
        auto &out_buf = conn->out_buffer();
        int fd = conn->fd();

        if (conn_db_map.find(fd) == conn_db_map.end()) {
            conn_db_map[fd] = 0; // Default DB 0
            conn->set_close_callback([&conn_db_map](std::shared_ptr<redisx::net::Connection> c) {
                conn_db_map.erase(c->fd());
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
            std::size_t out_db = active_db;

            dispatcher.dispatch(cmd, keyspace, active_db, out_buf, out_db);
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

    REDISX_LOG_INFO("RedisX Stage 3 Server running on %s:%u", host.c_str(), port);
    loop.run();

    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}