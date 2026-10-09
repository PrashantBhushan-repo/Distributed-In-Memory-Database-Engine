#include "redisx/commands/admin_cmds.h"
#include "redisx/commands/blocking.h"
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
#include "redisx/config/config.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/memory/accounting.h"
#include "redisx/memory/eviction.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/obs/info.h"
#include "redisx/obs/latency.h"
#include "redisx/obs/metrics.h"
#include "redisx/obs/slowlog.h"
#include "redisx/persistence/recovery.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/pubsub/keyspace_notify.h"
#include "redisx/pubsub/pubsub.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replica_link.h"
#include "redisx/replication/replid.h"
#include "redisx/security/acl.h"
#include "redisx/security/auth.h"
#include "redisx/security/tls.h"
#include "redisx/tx/transaction.h"
#include "redisx/tx/watch.h"

#include <algorithm>
#include <chrono>
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
    std::cout << "Usage: " << prog_name << " [OPTIONS] [config_file]\n"
              << "Options:\n"
              << "  -p <port>         TCP port (default: 6379)\n"
              << "  -h <host>         Bind host IP (default: 127.0.0.1)\n"
              << "  --requirepass <p> Set authentication password\n"
              << "  --version         Output version information and exit\n"
              << "  --help            Output this help menu and exit\n";
}

int main(int argc, char *argv[]) {
    redisx::config::ConfigManager config_mgr;
    config_mgr.load_cli_args(argc, argv);

    std::string host = config_mgr.get_string("bind", "127.0.0.1");
    std::uint16_t port = static_cast<std::uint16_t>(config_mgr.get_int("port", 6379));

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

    REDISX_LOG_INFO("Starting RedisX server v0.1.0 (Stage 10 Configuration, Security & Observability)");

    redisx::net::EventLoop loop;
    g_loop = &loop;

    // Storage Keyspace, TTL Manager, Eviction Manager & Replication Context
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::memory::EvictionManager evict_mgr;
    redisx::commands::Dispatcher dispatcher;

    redisx::security::AuthEngine auth_engine;
    std::string reqpass = config_mgr.get_string("requirepass");
    if (!reqpass.empty()) {
        auth_engine.set_requirepass(reqpass);
    }

    redisx::security::AclEngine acl_engine;
    redisx::obs::SlowlogManager slowlog_mgr;
    redisx::obs::LatencyMonitor latency_mon;
    redisx::obs::ServerStats server_stats;
    server_stats.start_time_ms = redisx::core::monotonic_now_ms();

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

    redisx::tx::WatchManager watch_mgr;
    redisx::pubsub::PubSubManager pubsub_mgr;
    redisx::commands::BlockedClientsManager blocked_mgr(loop);

    std::unordered_map<int, std::shared_ptr<redisx::net::Connection>> active_clients;

    redisx::commands::register_expire_commands(dispatcher, ttl_mgr);
    redisx::commands::register_string_commands(dispatcher, ttl_mgr, &server_stats);
    redisx::commands::register_list_commands(dispatcher);
    redisx::commands::register_hash_commands(dispatcher);
    redisx::commands::register_set_commands(dispatcher);
    redisx::commands::register_zset_commands(dispatcher);
    redisx::commands::register_memory_commands(dispatcher, evict_mgr);
    redisx::commands::register_persist_commands(dispatcher);
    redisx::commands::register_repl_commands(dispatcher, repl_ctx);
    redisx::tx::register_tx_commands(dispatcher, watch_mgr);
    redisx::pubsub::register_pubsub_commands(dispatcher, pubsub_mgr);
    redisx::commands::register_blocking_commands(dispatcher, blocked_mgr, &watch_mgr, &pubsub_mgr);

    redisx::config::register_config_commands(dispatcher, config_mgr, &evict_mgr);
    redisx::security::register_auth_commands(dispatcher, auth_engine);
    redisx::security::register_acl_commands(dispatcher, acl_engine);
    redisx::obs::register_slowlog_commands(dispatcher, slowlog_mgr);
    redisx::obs::register_latency_commands(dispatcher, latency_mon);
    redisx::commands::register_admin_commands(dispatcher, active_clients);

    // Startup recovery (Load RDB snapshot and replay AOF log)
    auto recovery_res = redisx::persistence::RecoveryEngine::recover(keyspace, dispatcher, "dump.rdb", "appendonly.aof");
    if (recovery_res.is_error() && recovery_res.error() != redisx::core::ErrorCode::NotFound) {
        REDISX_LOG_ERROR("Startup recovery failed with error code: %d", static_cast<int>(recovery_res.error()));
        return 1;
    }

    // Track active database index & auth per connection fd
    std::unordered_map<int, std::size_t> conn_db_map;
    std::unordered_map<int, redisx::tx::ClientTxState> conn_tx_map;
    std::unordered_map<int, bool> conn_auth_map;
    std::unordered_map<int, std::string> conn_user_map;

    // Register periodic idle timer for background incremental rehashing & active TTL expiration (every 100ms)
    loop.add_timer(100, [&keyspace, &ttl_mgr]() {
        keyspace.rehash_step_all(100);
        ttl_mgr.active_expire_cycle(keyspace, 1);
    });

    redisx::net::Listener listener(loop, host, port);
    redisx::obs::register_info_commands(dispatcher, keyspace, evict_mgr, repl_ctx, config_mgr, server_stats, &listener);

    std::unordered_map<int, std::uint16_t> conn_port_map;

    listener.set_new_connection_callback([&dispatcher, &keyspace, &conn_db_map, &conn_tx_map, &conn_auth_map, &conn_user_map, &conn_port_map, &active_clients, &evict_mgr, &ttl_mgr, &repl_stream, &replica_link, &watch_mgr, &pubsub_mgr, &blocked_mgr, &auth_engine, &acl_engine, &slowlog_mgr, &latency_mon, &config_mgr, &server_stats](
                                               std::shared_ptr<redisx::net::Connection> conn) {
        int fd = conn->fd();
        conn_db_map[fd] = 0; // Default DB 0
        conn_auth_map[fd] = !auth_engine.is_auth_required();
        conn_user_map[fd] = "default";
        active_clients[fd] = conn;
        server_stats.total_connections_received++;

        watch_mgr.register_client_tx(fd, &conn_tx_map[fd]);
        conn->set_close_callback([&conn_db_map, &conn_tx_map, &conn_auth_map, &conn_user_map, &conn_port_map, &active_clients, &repl_stream, &watch_mgr, &pubsub_mgr, &blocked_mgr](std::shared_ptr<redisx::net::Connection> c) {
            int cfd = c->fd();
            conn_db_map.erase(cfd);
            conn_port_map.erase(cfd);
            conn_auth_map.erase(cfd);
            conn_user_map.erase(cfd);
            active_clients.erase(cfd);
            watch_mgr.unregister_client_tx(cfd);
            pubsub_mgr.remove_client(cfd);
            blocked_mgr.remove_client(cfd);
            conn_tx_map.erase(cfd);
            repl_stream.remove_replica(cfd);
        });

        conn->set_data_callback([&dispatcher, &keyspace, &conn_db_map, &conn_tx_map, &conn_auth_map, &conn_user_map, &conn_port_map, &active_clients, &evict_mgr, &ttl_mgr, &repl_stream, &replica_link, &watch_mgr, &pubsub_mgr, &blocked_mgr, &auth_engine, &acl_engine, &slowlog_mgr, &latency_mon, &config_mgr, &server_stats](
                                    std::shared_ptr<redisx::net::Connection> c) {
            auto &in_buf = c->in_buffer();
            auto &out_buf = c->out_buffer();
            int cfd = c->fd();
            std::size_t active_db = conn_db_map[cfd];
            auto &client_tx = conn_tx_map[cfd];

        while (in_buf.readable_bytes() > 0) {
            auto result = redisx::proto::RespReader::parse(in_buf);
            if (result.is_error()) {
                REDISX_LOG_WARN("Protocol error on fd %d, closing connection", cfd);
                redisx::proto::RespWriter::write_error(
                    out_buf, "ERR Protocol error: invalid multibulk length or format");
                c->close();
                break;
            }

            if (!result.value().has_value()) {
                break; // Incomplete command, wait for more data
            }

            const auto &cmd = result.value().value();
            std::string cmd_name = cmd.name_upper();
            server_stats.total_commands_processed++;

            // Security: Authentication Check
            if (!conn_auth_map[cfd] && !auth_engine.is_command_allowed_unauthenticated(cmd_name)) {
                redisx::proto::RespWriter::write_error(out_buf, "NOAUTH Authentication required.");
                continue;
            }

            // Security: ACL Check
            const auto *user = acl_engine.get_user(conn_user_map[cfd]);
            const auto *spec = dispatcher.find_command(cmd_name);
            if (user && !acl_engine.check_permission(*user, cmd, spec)) {
                redisx::proto::RespWriter::write_error(out_buf, "NOPERM this user has no permissions to run the '" + cmd_name + "' command");
                continue;
            }

            if (pubsub_mgr.is_subscribed(cfd)) {
                if (cmd_name == "SUBSCRIBE" && cmd.arg_count() >= 2) {
                    for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.subscribe(c, cmd.arg(i));
                    continue;
                } else if (cmd_name == "UNSUBSCRIBE") {
                    if (cmd.arg_count() == 1) pubsub_mgr.unsubscribe_all(c);
                    else for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.unsubscribe(c, cmd.arg(i));
                    continue;
                } else if (cmd_name == "PSUBSCRIBE" && cmd.arg_count() >= 2) {
                    for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.psubscribe(c, cmd.arg(i));
                    continue;
                } else if (cmd_name == "PUNSUBSCRIBE") {
                    if (cmd.arg_count() == 1) pubsub_mgr.punsubscribe_all(c);
                    else for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.punsubscribe(c, cmd.arg(i));
                    continue;
                } else if (cmd_name != "PING" && cmd_name != "QUIT" && cmd_name != "RESET" && cmd_name != "PUBSUB") {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR Only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context");
                    continue;
                }
            }

            if (cmd_name == "SUBSCRIBE" && cmd.arg_count() >= 2) {
                for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.subscribe(c, cmd.arg(i));
                continue;
            } else if (cmd_name == "PSUBSCRIBE" && cmd.arg_count() >= 2) {
                for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.psubscribe(c, cmd.arg(i));
                continue;
            }

            if (cmd_name == "REPLCONF" && cmd.arg_count() >= 3) {
                std::string sub = cmd.arg(1);
                std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
                if (sub == "LISTENING-PORT") {
                    try {
                        conn_port_map[cfd] = static_cast<std::uint16_t>(std::stoul(cmd.arg(2)));
                    } catch (...) {}
                } else if (sub == "ACK") {
                    try {
                        std::uint64_t ack_off = std::stoull(cmd.arg(2));
                        repl_stream.update_replica_ack(cfd, ack_off, redisx::core::monotonic_now_ms());
                    } catch (...) {}
                }
            } else if (cmd_name == "PSYNC") {
                std::uint16_t repl_port = conn_port_map.count(cfd) ? conn_port_map[cfd] : 0;
                repl_stream.add_replica(c, repl_port);
            }

            // Transactions (MULTI / EXEC / DISCARD / WATCH / UNWATCH)
            if (cmd_name == "MULTI") {
                if (client_tx.in_multi) {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR MULTI calls can not be nested");
                } else {
                    client_tx.in_multi = true;
                    client_tx.exec_abort = false;
                    client_tx.queue.clear();
                    redisx::proto::RespWriter::write_simple_string(out_buf, "OK");
                }
                continue;
            } else if (cmd_name == "DISCARD") {
                if (!client_tx.in_multi) {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR DISCARD without MULTI");
                } else {
                    watch_mgr.unwatch_all(cfd, client_tx);
                    client_tx.reset_multi();
                    redisx::proto::RespWriter::write_simple_string(out_buf, "OK");
                }
                continue;
            } else if (cmd_name == "WATCH") {
                if (client_tx.in_multi) {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR WATCH inside MULTI is not allowed");
                } else {
                    for (std::size_t i = 1; i < cmd.arg_count(); ++i) {
                        watch_mgr.watch_key(cfd, active_db, cmd.arg(i), client_tx);
                    }
                    redisx::proto::RespWriter::write_simple_string(out_buf, "OK");
                }
                continue;
            } else if (cmd_name == "UNWATCH") {
                watch_mgr.unwatch_all(cfd, client_tx);
                redisx::proto::RespWriter::write_simple_string(out_buf, "OK");
                continue;
            } else if (cmd_name == "EXEC") {
                if (!client_tx.in_multi) {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR EXEC without MULTI");
                } else if (client_tx.exec_abort) {
                    watch_mgr.unwatch_all(cfd, client_tx);
                    client_tx.reset_multi();
                    redisx::proto::RespWriter::write_error(out_buf, "EXECABORT Transaction discarded because of previous errors.");
                } else if (client_tx.dirty_cas) {
                    watch_mgr.unwatch_all(cfd, client_tx);
                    client_tx.reset_multi();
                    redisx::proto::RespWriter::write_null_array(out_buf);
                } else {
                    auto queue = std::move(client_tx.queue);
                    watch_mgr.unwatch_all(cfd, client_tx);
                    client_tx.reset_multi();

                    redisx::proto::RespWriter::write_array_header(out_buf, queue.size());
                    for (const auto &qcmd : queue) {
                        redisx::proto::Command c_qcmd(qcmd.args);
                        const auto *qspec = dispatcher.find_command(qcmd.name_upper);
                        std::size_t dummy_out_db = qcmd.db_idx;
                        dispatcher.dispatch(c_qcmd, keyspace, qcmd.db_idx, out_buf, dummy_out_db, &evict_mgr, &ttl_mgr);
                        if (qspec && (qspec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                            repl_stream.propagate_command(c_qcmd, keyspace, qcmd.db_idx);
                            if (c_qcmd.arg_count() >= 2) {
                                watch_mgr.touch_key(qcmd.db_idx, c_qcmd.arg(1));
                                redisx::pubsub::notify_keyspace_event(pubsub_mgr, qcmd.db_idx, qcmd.name_upper, c_qcmd.arg(1), 'g');
                                blocked_mgr.signal_ready_key(qcmd.db_idx, c_qcmd.arg(1));
                            }
                        }
                    }
                }
                continue;
            }

            if (client_tx.in_multi) {
                bool valid = (spec != nullptr);
                if (valid) {
                    if (spec->arity > 0 && cmd.arg_count() != static_cast<std::size_t>(spec->arity)) valid = false;
                    else if (spec->arity < 0 && cmd.arg_count() < static_cast<std::size_t>(-spec->arity)) valid = false;
                }
                if (!valid) {
                    client_tx.exec_abort = true;
                    redisx::proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments or syntax error");
                } else {
                    client_tx.queue.push_back({cmd_name, cmd.args(), active_db});
                    redisx::proto::RespWriter::write_simple_string(out_buf, "QUEUED");
                }
                continue;
            }

            // Replicas in read-only mode reject client write commands
            if (replica_link.is_replica_mode() && spec && (spec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                redisx::proto::RespWriter::write_error(out_buf, "READONLY You can't write against a read only replica.");
                break;
            }

            std::size_t out_db = active_db;
            std::size_t start_readable_out = out_buf.readable_bytes();

            auto start_t = std::chrono::steady_clock::now();
            dispatcher.dispatch(cmd, keyspace, active_db, out_buf, out_db, &evict_mgr, &ttl_mgr);
            auto end_t = std::chrono::steady_clock::now();

            std::uint64_t dur_us = static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(end_t - start_t).count());
            slowlog_mgr.log_command(cmd, dur_us, config_mgr.get_int("slowlog-log-slower-than", 10000), static_cast<std::size_t>(config_mgr.get_int("slowlog-max-len", 128)));
            if (dur_us > 10000) {
                latency_mon.record_latency("command", dur_us / 1000);
            }

            // If AUTH command succeeded, update connection auth state
            if (cmd_name == "AUTH" && auth_engine.is_auth_required()) {
                std::string pass = (cmd.arg_count() >= 3) ? cmd.arg(2) : cmd.arg(1);
                if (auth_engine.authenticate(pass)) {
                    conn_auth_map[cfd] = true;
                    if (cmd.arg_count() >= 3) conn_user_map[cfd] = cmd.arg(1);
                }
            }

            // Check if output is a parking marker for blocking command
            std::string_view out_view = out_buf.peek_string_view().substr(start_readable_out);
            if (out_view == "+PARK_BLPOP\r\n" || out_view == "+PARK_BRPOP\r\n" || out_view == "+PARK_BLMOVE\r\n" || out_view == "+PARK_BRPOPLPUSH\r\n") {
                std::string marker(out_view);
                out_buf.consume(out_view.size());

                double timeout_sec = 0.0;
                std::vector<std::string> keys;
                std::string target_key;
                redisx::commands::BlockingOpType op_type = redisx::commands::BlockingOpType::BLPOP;
                bool left_pop = true;
                bool left_push = true;

                if (marker == "+PARK_BLPOP\r\n" || marker == "+PARK_BRPOP\r\n") {
                    op_type = (marker == "+PARK_BLPOP\r\n") ? redisx::commands::BlockingOpType::BLPOP : redisx::commands::BlockingOpType::BRPOP;
                    left_pop = (op_type == redisx::commands::BlockingOpType::BLPOP);
                    try { timeout_sec = std::stod(cmd.arg(cmd.arg_count() - 1)); } catch (...) {}
                    for (std::size_t i = 1; i < cmd.arg_count() - 1; ++i) keys.push_back(cmd.arg(i));
                } else if (marker == "+PARK_BLMOVE\r\n") {
                    op_type = redisx::commands::BlockingOpType::BLMOVE;
                    keys.push_back(cmd.arg(1));
                    target_key = cmd.arg(2);
                    std::string wf = cmd.arg(3);
                    std::string wt = cmd.arg(4);
                    std::transform(wf.begin(), wf.end(), wf.begin(), ::toupper);
                    std::transform(wt.begin(), wt.end(), wt.begin(), ::toupper);
                    left_pop = (wf == "LEFT");
                    left_push = (wt == "LEFT");
                    try { timeout_sec = std::stod(cmd.arg(5)); } catch (...) {}
                } else if (marker == "+PARK_BRPOPLPUSH\r\n") {
                    op_type = redisx::commands::BlockingOpType::BRPOPLPUSH;
                    keys.push_back(cmd.arg(1));
                    target_key = cmd.arg(2);
                    left_pop = false;
                    left_push = true;
                    try { timeout_sec = std::stod(cmd.arg(3)); } catch (...) {}
                }

                blocked_mgr.block_client(c, active_db, keys, target_key, op_type, left_pop, left_push, timeout_sec);
                break;
            }

            // Propagate write commands to connected replicas & notifications
            if (spec && (spec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                repl_stream.propagate_command(cmd, keyspace, active_db);
                if (cmd.arg_count() >= 2) {
                    watch_mgr.touch_key(active_db, cmd.arg(1));
                    redisx::pubsub::notify_keyspace_event(pubsub_mgr, active_db, cmd_name, cmd.arg(1), 'g');
                    blocked_mgr.signal_ready_key(active_db, cmd.arg(1));
                }
            }

            active_db = out_db;
            blocked_mgr.drain_ready_keys(keyspace, dispatcher, &watch_mgr, &pubsub_mgr);
        }

        conn_db_map[cfd] = active_db;
        c->flush();
    });
    });

    auto result = listener.start();
    if (result.is_error()) {
        REDISX_LOG_ERROR("Failed to start listener on %s:%u", host.c_str(), port);
        return 1;
    }

    std::uint16_t metrics_port = static_cast<std::uint16_t>(config_mgr.get_int("metrics-port", 9121));
    redisx::net::Listener metrics_listener(loop, host, metrics_port);
    metrics_listener.set_new_connection_callback([&keyspace, &evict_mgr, &repl_ctx, &server_stats, &listener, &ttl_mgr](std::shared_ptr<redisx::net::Connection> conn) {
        conn->set_data_callback([&keyspace, &evict_mgr, &repl_ctx, &server_stats, &listener, &ttl_mgr](std::shared_ptr<redisx::net::Connection> c) {
            auto &in_buf = c->in_buffer();
            auto &out_buf = c->out_buffer();

            if (in_buf.readable_bytes() > 0) {
                std::size_t len = in_buf.readable_bytes();
                in_buf.consume(len);
                std::size_t active_cnt = listener.active_clients_count();
                std::string body = redisx::obs::PrometheusExporter::generate_metrics(
                    keyspace, evict_mgr, repl_ctx, server_stats, active_cnt, &ttl_mgr);
                std::string resp = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: " +
                                   std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
                out_buf.append(resp);
                c->flush();
                c->close();
            }
        });
    });
    metrics_listener.start();

    REDISX_LOG_INFO("RedisX Stage 10 Server running on %s:%u (Metrics HTTP server on %s:%u)", host.c_str(), port, host.c_str(), metrics_port);
    loop.run();

    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}