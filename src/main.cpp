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
#include "redisx/persistence/service.h"
#include "redisx/commands/keys.h"
#include <functional>
#include "redisx/commands/numeric.h"
#include <filesystem>
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

static volatile std::sig_atomic_t stop_requested = 0;
static void signal_handler(int) { stop_requested = 1; }

static void poll_replica_wait(redisx::net::EventLoop &loop, redisx::replication::ReplStream &stream,
    std::weak_ptr<redisx::net::Connection> client, std::uint64_t offset, std::uint64_t count, std::uint64_t deadline) {
    auto conn = client.lock();
    if (!conn || conn->state() != redisx::net::ConnectionState::Connected) return;
    const auto acked = stream.count_replicas_at_offset(offset);
    if (acked >= count || (deadline && redisx::core::monotonic_now_ms() >= deadline)) {
        redisx::proto::RespWriter::write_integer(conn->out_buffer(), static_cast<std::int64_t>(acked));
        conn->flush(); conn->resume_reading(); return;
    }
    loop.add_timer(10, [&loop, &stream, client, offset, count, deadline] { poll_replica_wait(loop, stream, client, offset, count, deadline); });
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
    std::string config_file;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--version") { std::cout << "redisx 0.1.0\n"; return 0; }
        if (arg == "--help") { print_help(argv[0]); return 0; }
        if (arg == "-c" || arg == "--config") {
            if (++i == argc) { std::cerr << "Missing config path\n"; return 1; }
            config_file = argv[i];
        } else if (arg.starts_with('-')) {
            if (++i == argc) { std::cerr << "Missing option value\n"; return 1; }
        } else if (config_file.empty()) config_file = arg;
        else { std::cerr << "Unexpected argument: " << arg << "\n"; return 1; }
    }
    if (!config_file.empty() && !config_mgr.load_file(config_file)) return 1;
    if (!config_mgr.load_cli_args(argc, argv)) return 1;
    const std::string host = config_mgr.get_string("bind");
    const auto port = static_cast<std::uint16_t>(config_mgr.get_int("port"));

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    REDISX_LOG_INFO("Starting RedisX server v0.1.0 (Stage 10 Configuration, Security & Observability)");

    redisx::net::EventLoop loop;
    std::signal(SIGPIPE, SIG_IGN);

    // Storage Keyspace, TTL Manager, Eviction Manager & Replication Context
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::memory::EvictionManager evict_mgr;
    std::string maxmem_str = config_mgr.get_string("maxmemory", "0");
    try {
        evict_mgr.set_maxmemory(static_cast<std::size_t>(std::stoull(maxmem_str)));
    } catch (...) {}
    std::string policy_str = config_mgr.get_string("maxmemory-policy", "noeviction");
    evict_mgr.set_policy(redisx::memory::parse_eviction_policy(policy_str));

    redisx::commands::Dispatcher dispatcher;

    redisx::security::AuthEngine auth_engine;
    std::string reqpass = config_mgr.get_string("requirepass");
    if (!reqpass.empty()) {
        auth_engine.set_requirepass(reqpass);
    }

    redisx::security::AclEngine acl_engine;
    if (!reqpass.empty()) {
        auto *user = acl_engine.get_user_mut("default");
        user->nopass = false;
        user->password_hashes = {redisx::security::sha256_hex(reqpass)};
    }
    redisx::obs::SlowlogManager slowlog_mgr;
    redisx::obs::LatencyMonitor latency_mon;
    redisx::obs::ServerStats server_stats;
    server_stats.start_time_ms = redisx::core::monotonic_now_ms();

    redisx::replication::ReplIdManager replid_mgr;
    redisx::replication::ReplBacklog backlog(static_cast<std::size_t>(config_mgr.get_int("repl-backlog-size")));
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
    redisx::persistence::PersistenceService persistence(config_mgr);
    redisx::commands::register_persist_commands(dispatcher, &persistence);
    redisx::commands::register_repl_commands(dispatcher, repl_ctx);
    redisx::tx::register_tx_commands(dispatcher, watch_mgr);
    redisx::pubsub::register_pubsub_commands(dispatcher, pubsub_mgr);
    redisx::commands::register_blocking_commands(dispatcher, blocked_mgr, &watch_mgr, &pubsub_mgr);

    redisx::config::register_config_commands(dispatcher, config_mgr, &evict_mgr);
    redisx::security::register_auth_commands(dispatcher, auth_engine);
    redisx::security::register_acl_commands(dispatcher, acl_engine);
    redisx::obs::register_slowlog_commands(dispatcher, slowlog_mgr);
    redisx::obs::register_latency_commands(dispatcher, latency_mon);
    std::weak_ptr<redisx::net::Connection> current_client;
    redisx::commands::register_admin_commands(dispatcher, active_clients, [&] { return current_client.lock(); });

    // Startup recovery (Load RDB snapshot and replay AOF log)
    auto recovery_res = redisx::persistence::RecoveryEngine::recover(keyspace, dispatcher, persistence.snapshot_path(), persistence.enabled() ? persistence.aof_path() : "",
        {config_mgr.get_bool("aof-load-truncated")});
    if (recovery_res.is_error() && recovery_res.error() != redisx::core::ErrorCode::NotFound) {
        REDISX_LOG_ERROR("Startup recovery failed with error code: %d", static_cast<int>(recovery_res.error()));
        return 1;
    }

    // Track active database index & auth per connection fd
    std::unordered_map<int, std::size_t> conn_db_map;
    std::unordered_map<int, redisx::tx::ClientTxState> conn_tx_map;
    std::unordered_map<int, bool> conn_auth_map;
    std::unordered_map<int, std::string> conn_user_map;

    if (!persistence.open()) { REDISX_LOG_ERROR("Cannot initialize persistence"); return 1; }
    replica_link.set_full_sync_callback([&](const redisx::db::Keyspace &keys) { return persistence.replace_from_full_sync(keys); });
    dispatcher.set_write_guard([&] { return persistence.writable(); });
    dispatcher.set_write_observer([&](const redisx::proto::Command &cmd, redisx::db::Keyspace &keys, std::size_t db, std::string_view reply) {
        const auto &name = cmd.name_upper();
        const bool expiry = name == "EXPIRE" || name == "PEXPIRE" || name == "EXPIREAT" || name == "PEXPIREAT";
        if (expiry && reply == ":0\r\n") return true;
        if (reply == ":0\r\n" && (name == "DEL" || name == "UNLINK" || name == "SADD" || name == "SREM" || name == "HDEL" || name == "ZREM" || name == "PERSIST")) return true;
        std::vector<std::vector<std::string>> effects;
        if ((name == "SET" || expiry) && cmd.arg_count() >= 2) {
            const auto *entry = keys.db_get(db, cmd.arg(1));
            if (!entry) effects.push_back({"DEL", cmd.arg(1)});
            else {
                if (name == "SET") effects.push_back({"SET", cmd.arg(1), entry->value.as_string()});
                if (entry->expire_at_ms) effects.push_back({"PEXPIREAT", cmd.arg(1), std::to_string(entry->expire_at_ms)});
            }
        } else if (name == "BLPOP" || name == "BRPOP") {
            redisx::core::Buffer parsed_reply; parsed_reply.append(reply);
            auto parsed = redisx::proto::RespReader::parse(parsed_reply);
            if (parsed.is_error() || !parsed.value()) return true;
            effects.push_back({name == "BLPOP" ? "LPOP" : "RPOP", parsed.value()->arg(0)});
        } else if (name == "BLMOVE" || name == "BRPOPLPUSH") {
            if (reply.starts_with("$-1")) return true;
            const auto header = reply.find("\r\n");
            const std::string value(reply.substr(header + 2, reply.size() - header - 4));
            std::string from = name == "BRPOPLPUSH" ? "RIGHT" : cmd.arg(3);
            std::string to = name == "BRPOPLPUSH" ? "LEFT" : cmd.arg(4);
            std::transform(from.begin(), from.end(), from.begin(), ::toupper);
            std::transform(to.begin(), to.end(), to.begin(), ::toupper);
            effects.push_back({from == "LEFT" ? "LPOP" : "RPOP", cmd.arg(1)});
            effects.push_back({to == "LEFT" ? "LPUSH" : "RPUSH", cmd.arg(2), value});
        } else effects.push_back(cmd.args());
        if (effects.size() > 1 && !persistence.append(db, {"MULTI"})) return false;
        for (const auto &effect : effects) if (!persistence.append(db, effect)) return false;
        if (effects.size() > 1 && !persistence.append(db, {"EXEC"})) return false;
        if (effects.size() > 1) repl_stream.propagate_command(redisx::proto::Command({"MULTI"}), keys, db);
        for (const auto &effect : effects) repl_stream.propagate_command(redisx::proto::Command(effect), keys, db);
        if (effects.size() > 1) repl_stream.propagate_command(redisx::proto::Command({"EXEC"}), keys, db);
        if (name == "FLUSHDB") watch_mgr.touch_all(db);
        else if (name == "FLUSHALL") for (std::size_t d = 0; d < redisx::db::Keyspace::NUM_DATABASES; ++d) watch_mgr.touch_all(d);
        for (const auto i : redisx::commands::command_key_indices(cmd)) {
            watch_mgr.touch_key(db, cmd.arg(i));
            redisx::pubsub::notify_keyspace_event(pubsub_mgr, db, name, cmd.arg(i), 'g', config_mgr.get_string("notify-keyspace-events"));
            blocked_mgr.signal_ready_key(db, cmd.arg(i));
        }
        return true;
    });
    ttl_mgr.set_expire_callback([&](std::size_t db, const std::string &key) {
        persistence.append(db, {"DEL", key});
        repl_stream.propagate_explicit_del(db, key);
        watch_mgr.touch_key(db, key);
        redisx::pubsub::notify_keyspace_event(pubsub_mgr, db, "expired", key, 'x', config_mgr.get_string("notify-keyspace-events"));
    });
    evict_mgr.set_evict_callback([&](std::size_t db, const std::string &key) {
        persistence.append(db, {"DEL", key}); repl_stream.propagate_explicit_del(db, key); watch_mgr.touch_key(db, key);
    });
    ttl_mgr.attach(keyspace);
    std::uint64_t stats_time = redisx::core::monotonic_now_ms(), stats_commands = 0;
    std::function<void()> maintenance;
    maintenance = [&] {
        if (stop_requested) { loop.stop(); return; }
        keyspace.rehash_step_all(100);
        ttl_mgr.active_expire_cycle(keyspace, 1);
        persistence.tick(keyspace);
        server_stats.last_save_time = persistence.last_save_time();
        server_stats.expired_keys = ttl_mgr.stats().expired_keys;
        server_stats.evicted_keys = evict_mgr.evicted_keys();
        const auto now = redisx::core::monotonic_now_ms();
        const auto idle_ms = static_cast<std::uint64_t>(config_mgr.get_int("timeout")) * 1000;
        if (idle_ms) for (const auto &[fd, client] : active_clients) {
            if (!client->is_read_paused() && !pubsub_mgr.is_subscribed(fd) && !repl_stream.replicas().contains(fd) && now - client->last_activity_ms >= idle_ms) client->close();
        }
        if (now - stats_time >= 1000) {
            server_stats.ops_per_second = (server_stats.total_commands_processed - stats_commands) * 1000 / (now - stats_time);
            stats_commands = server_stats.total_commands_processed; stats_time = now;
        }
        loop.add_timer(100, maintenance);
    };
    loop.add_timer(100, maintenance);

    redisx::net::Listener listener(loop, host, port, static_cast<std::size_t>(config_mgr.get_int("maxclients")));
    redisx::obs::register_info_commands(dispatcher, keyspace, evict_mgr, repl_ctx, config_mgr, server_stats, &listener);

    std::unordered_map<int, std::uint16_t> conn_port_map;

    auto configure_client = [&dispatcher, &keyspace, &conn_db_map, &conn_tx_map, &conn_auth_map, &conn_user_map, &conn_port_map, &active_clients, &evict_mgr, &ttl_mgr, &repl_stream, &replica_link, &watch_mgr, &pubsub_mgr, &blocked_mgr, &auth_engine, &acl_engine, &slowlog_mgr, &latency_mon, &config_mgr, &server_stats, &persistence, &loop, &replid_mgr, &current_client](
                                               std::shared_ptr<redisx::net::Connection> conn) {
        int fd = conn->fd();
        conn_db_map[fd] = 0; // Default DB 0
        conn_auth_map[fd] = acl_engine.get_user("default")->enabled && acl_engine.get_user("default")->nopass;
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

        conn->set_data_callback([&dispatcher, &keyspace, &conn_db_map, &conn_tx_map, &conn_auth_map, &conn_user_map, &conn_port_map, &evict_mgr, &ttl_mgr, &repl_stream, &replica_link, &watch_mgr, &pubsub_mgr, &blocked_mgr, &auth_engine, &acl_engine, &slowlog_mgr, &latency_mon, &config_mgr, &server_stats, &persistence, &loop, &replid_mgr, &current_client, parser = std::make_shared<redisx::proto::StreamingRespReader>()](
                                    std::shared_ptr<redisx::net::Connection> c) {
            auto &in_buf = c->in_buffer();
            auto &out_buf = c->out_buffer();
            int cfd = c->fd();
            std::size_t active_db = conn_db_map[cfd];
            auto &client_tx = conn_tx_map[cfd];

        while (in_buf.readable_bytes() > 0) {
            auto result = parser->parse(in_buf);
            if (result.is_error()) {
                REDISX_LOG_WARN("Protocol error on fd %d, closing connection", cfd);
                redisx::proto::RespWriter::write_error(
                    out_buf, "ERR Protocol error: invalid multibulk length or format");
                c->close_after_flush();
                break;
            }

            if (!result.value().has_value()) {
                break; // Incomplete command, wait for more data
            }

            current_client = c;
            c->selected_db = active_db;
            const auto &cmd = result.value().value();
            std::string cmd_name = cmd.name_upper();
            server_stats.total_commands_processed++;

            // Synchronize runtime requirepass changes with the default ACL user.
            if (config_mgr.get_string("requirepass") != auth_engine.requirepass()) {
                auth_engine.set_requirepass(config_mgr.get_string("requirepass"));
                auto *def = acl_engine.get_user_mut("default");
                def->nopass = !auth_engine.is_auth_required();
                def->password_hashes = def->nopass ? std::vector<std::string>{} : std::vector<std::string>{redisx::security::sha256_hex(config_mgr.get_string("requirepass"))};
            }
            if (client_tx.in_multi && (cmd_name == "AUTH" || cmd_name == "HELLO" || cmd_name == "CLIENT" || cmd_name == "SUBSCRIBE" || cmd_name == "PSUBSCRIBE" || cmd_name == "UNSUBSCRIBE" || cmd_name == "PUNSUBSCRIBE" || cmd_name == "PSYNC" || cmd_name == "REPLCONF" || cmd_name == "REPLICAOF" || cmd_name == "SLAVEOF")) {
                client_tx.exec_abort = true;
                redisx::proto::RespWriter::write_error(out_buf, "ERR connection state commands are not supported inside MULTI"); continue;
            }
            if (cmd_name == "AUTH") {
                if (cmd.arg_count() != 2 && cmd.arg_count() != 3) {
                    redisx::proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments for 'auth' command");
                } else {
                    const auto username = cmd.arg_count() == 3 ? cmd.arg(1) : "default";
                    const auto &password = cmd.arg(cmd.arg_count() - 1);
                    if (acl_engine.authenticate(username, password)) {
                        conn_auth_map[cfd] = true; conn_user_map[cfd] = username;
                        redisx::proto::RespWriter::write_simple_string(out_buf, "OK");
                    } else redisx::proto::RespWriter::write_error(out_buf, "WRONGPASS invalid username-password pair or user is disabled");
                }
                continue;
            }
            if (cmd_name == "QUIT" && cmd.arg_count() == 1) {
                redisx::proto::RespWriter::write_simple_string(out_buf, "OK"); c->close_after_flush(); break;
            }
            if (!conn_auth_map[cfd]) {
                redisx::proto::RespWriter::write_error(out_buf, "NOAUTH Authentication required."); continue;
            }
            const auto *user = acl_engine.get_user(conn_user_map[cfd]);
            const auto *spec = dispatcher.find_command(cmd_name);
            if (!user || !acl_engine.check_permission(*user, cmd, spec)) {
                redisx::proto::RespWriter::write_error(out_buf, "NOPERM this user has no permissions to run the command");
                continue;
            }
            if (cmd_name == "ACL" && cmd.arg_count() == 2 && (cmd.arg(1) == "WHOAMI" || cmd.arg(1) == "whoami")) {
                redisx::proto::RespWriter::write_bulk_string(out_buf, conn_user_map[cfd]); continue;
            }
            if (((cmd_name == "MULTI" || cmd_name == "EXEC" || cmd_name == "DISCARD" || cmd_name == "UNWATCH") && cmd.arg_count() != 1) || (cmd_name == "WATCH" && cmd.arg_count() < 2)) {
                if (client_tx.in_multi) client_tx.exec_abort = true;
                redisx::proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments"); continue;
            }

            if (pubsub_mgr.is_subscribed(cfd) && cmd_name == "PING" && cmd.arg_count() <= 2) {
                redisx::proto::RespWriter::write_array_header(out_buf, 2);
                redisx::proto::RespWriter::write_bulk_string(out_buf, "pong");
                redisx::proto::RespWriter::write_bulk_string(out_buf, cmd.arg_count() == 2 ? cmd.arg(1) : ""); continue;
            }
            if (cmd_name == "UNSUBSCRIBE" || cmd_name == "PUNSUBSCRIBE") {
                if (cmd_name == "UNSUBSCRIBE") {
                    if (cmd.arg_count() == 1) pubsub_mgr.unsubscribe_all(c);
                    else for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.unsubscribe(c, cmd.arg(i));
                } else {
                    if (cmd.arg_count() == 1) pubsub_mgr.punsubscribe_all(c);
                    else for (std::size_t i = 1; i < cmd.arg_count(); ++i) pubsub_mgr.punsubscribe(c, cmd.arg(i));
                }
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
                        ttl_mgr.expire_if_needed(keyspace, active_db, cmd.arg(i));
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
                for (const auto &watched : client_tx.watched_keys) ttl_mgr.expire_if_needed(keyspace, watched.first, watched.second);
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

                    redisx::core::Buffer transaction_reply;
                    redisx::proto::RespWriter::write_array_header(transaction_reply, queue.size());
                    const bool writes = std::any_of(queue.begin(), queue.end(), [&](const auto &q) { const auto *sp = dispatcher.find_command(q.name_upper); return sp && (sp->flags & redisx::commands::CMD_FLAG_WRITE); });
                    bool durable = !writes || persistence.append(active_db, {"MULTI"});
                    if (writes) repl_stream.propagate_command(redisx::proto::Command({"MULTI"}), keyspace, active_db);
                    for (const auto &qcmd : queue) {
                        redisx::proto::Command c_qcmd(qcmd.args);
                        const auto *qspec = dispatcher.find_command(qcmd.name_upper);
                        const auto *quser = acl_engine.get_user(conn_user_map[cfd]);
                        if (!quser || !acl_engine.check_permission(*quser, c_qcmd, qspec)) {
                            redisx::proto::RespWriter::write_error(transaction_reply, "NOPERM permissions changed since the command was queued"); continue;
                        }
                        if (replica_link.is_replica_mode() && qspec && (qspec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                            redisx::proto::RespWriter::write_error(transaction_reply, "READONLY You can't write against a read only replica."); continue;
                        }
                        std::size_t selected = active_db;
                        redisx::core::Buffer reply;
                        dispatcher.dispatch(c_qcmd, keyspace, active_db, reply, selected, &evict_mgr, &ttl_mgr);
                        if (reply.peek_string_view().starts_with("+PARK_")) redisx::proto::RespWriter::write_null_array(transaction_reply);
                        else transaction_reply.append(reply.peek_string_view());
                        active_db = selected;
                    }
                    if (writes) {
                        durable = persistence.append(active_db, {"EXEC"}) && durable;
                        repl_stream.propagate_command(redisx::proto::Command({"EXEC"}), keyspace, active_db);
                    }
                    if (!durable) redisx::proto::RespWriter::write_error(out_buf, "MISCONF transaction persistence failed; writes are disabled");
                    else out_buf.append(transaction_reply.peek_string_view());
                    blocked_mgr.drain_ready_keys(keyspace, dispatcher, &watch_mgr, &pubsub_mgr);
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

            if (cmd_name == "WAIT" && cmd.arg_count() == 3) {
                try {
                    const auto count = redisx::commands::parse_integer(cmd.arg(1));
                    const auto timeout = redisx::commands::parse_integer(cmd.arg(2));
                    if (count < 0 || timeout < 0) throw std::invalid_argument("WAIT");
                    c->pause_reading();
                    poll_replica_wait(loop, repl_stream, c, replid_mgr.master_repl_offset(), static_cast<std::uint64_t>(count), timeout ? redisx::core::monotonic_now_ms() + static_cast<std::uint64_t>(timeout) : 0);
                    break;
                } catch (const std::exception &) { redisx::proto::RespWriter::write_error(out_buf, "ERR invalid WAIT count or timeout"); continue; }
            }

            // Replicas in read-only mode reject client write commands
            if (replica_link.is_replica_mode() && spec && (spec->flags & redisx::commands::CMD_FLAG_WRITE)) {
                redisx::proto::RespWriter::write_error(out_buf, "READONLY You can't write against a read only replica.");
                continue;
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

            // Check if output is a parking marker for blocking command
            std::string_view out_view = out_buf.peek_string_view().substr(start_readable_out);
            if (out_view == "+PARK_BLPOP\r\n" || out_view == "+PARK_BRPOP\r\n" || out_view == "+PARK_BLMOVE\r\n" || out_view == "+PARK_BRPOPLPUSH\r\n") {
                std::string marker(out_view);
                out_buf.truncate_readable(start_readable_out);

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

            active_db = out_db;
            blocked_mgr.drain_ready_keys(keyspace, dispatcher, &watch_mgr, &pubsub_mgr);
        }

        conn_db_map[cfd] = active_db;
        c->flush();
    });
    };
    listener.set_new_connection_callback(configure_client);
    listener.set_backlog(static_cast<int>(config_mgr.get_int("tcp-backlog")));
    listener.set_keepalive(static_cast<int>(config_mgr.get_int("tcp-keepalive")));
    const auto tls_port = static_cast<std::uint16_t>(config_mgr.get_int("tls-port"));
    redisx::net::Listener tls_listener(loop, host, tls_port, static_cast<std::size_t>(config_mgr.get_int("maxclients")));
    if (tls_port) {
        try {
            tls_listener.set_tls_context(std::make_shared<redisx::security::TlsContext>(config_mgr.get_string("tls-cert-file"), config_mgr.get_string("tls-key-file")));
        } catch (const std::exception &error) { REDISX_LOG_ERROR("%s", error.what()); return 1; }
        tls_listener.set_new_connection_callback(configure_client);
        if (tls_listener.start().is_error()) return 1;
    }

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

            if (in_buf.readable_bytes() > 8192) { c->close(); return; }
            const auto request = in_buf.peek_string_view();
            if (request.find("\r\n\r\n") == std::string_view::npos) return;
            if (!request.starts_with("GET /metrics HTTP/1.")) {
                out_buf.append("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); c->close_after_flush(); return;
            }
            if (in_buf.readable_bytes() > 0) {
                std::size_t len = in_buf.readable_bytes();
                in_buf.consume(len);
                std::size_t active_cnt = listener.active_clients_count();
                std::string body = redisx::obs::PrometheusExporter::generate_metrics(
                    keyspace, evict_mgr, repl_ctx, server_stats, active_cnt, &ttl_mgr);
                std::string resp = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: " +
                                   std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
                out_buf.append(resp);
                c->close_after_flush();
            }
        });
    });
    if (metrics_port != 0 && metrics_listener.start().is_error()) { REDISX_LOG_ERROR("Cannot bind metrics listener"); return 1; }

    REDISX_LOG_INFO("RedisX Stage 10 Server running on %s:%u (Metrics HTTP server on %s:%u)", host.c_str(), port, host.c_str(), metrics_port);
    loop.run();

    replica_link.make_master();
    for (const auto &[fd, client] : active_clients) { (void)fd; client->close(); }
    listener.stop(); tls_listener.stop(); metrics_listener.stop();
    loop.run_once(0);
    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}