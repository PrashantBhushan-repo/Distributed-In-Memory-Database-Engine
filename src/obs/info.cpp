#include "redisx/obs/info.h"
#include "redisx/core/time.h"
#include "redisx/memory/accounting.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <sstream>

namespace redisx::obs {

std::string InfoProvider::generate_info(
    const std::string &section,
    const db::Keyspace &keyspace,
    const memory::EvictionManager &evict_mgr,
    const commands::ReplicationContext &repl_ctx,
    const config::ConfigManager &config_mgr,
    const ServerStats &stats,
    std::size_t connected_clients,
    std::size_t blocked_clients
) {
    std::string sec = section;
    std::transform(sec.begin(), sec.end(), sec.begin(), ::tolower);
    if (sec.empty()) sec = "all";

    std::ostringstream ss;
    std::uint64_t now_ms = core::monotonic_now_ms();
    std::uint64_t uptime_sec = (now_ms - stats.start_time_ms) / 1000;

    if (sec == "all" || sec == "server" || sec == "default") {
        ss << "# Server\r\n";
        ss << "redis_version:0.1.0\r\n";
        ss << "redis_mode:standalone\r\n";
        ss << "os:Linux/Windows\r\n";
        ss << "arch_bits:64\r\n";
        ss << "process_id:1234\r\n";
        ss << "tcp_port:" << config_mgr.get_int("port", 6379) << "\r\n";
        ss << "uptime_in_seconds:" << uptime_sec << "\r\n";
        ss << "uptime_in_days:" << (uptime_sec / 86400) << "\r\n\r\n";
    }

    if (sec == "all" || sec == "clients" || sec == "default") {
        ss << "# Clients\r\n";
        ss << "connected_clients:" << connected_clients << "\r\n";
        ss << "blocked_clients:" << blocked_clients << "\r\n";
        ss << "tracking_clients:0\r\n\r\n";
    }

    if (sec == "all" || sec == "memory" || sec == "default") {
        std::size_t used = memory::MemoryTracker::instance().used_memory();
        std::size_t maxmem = evict_mgr.maxmemory();
        ss << "# Memory\r\n";
        ss << "used_memory:" << used << "\r\n";
        ss << "used_memory_human:" << (used / 1024) << "K\r\n";
        ss << "used_memory_peak:" << used << "\r\n";
        ss << "maxmemory:" << maxmem << "\r\n";
        ss << "maxmemory_policy:" << config_mgr.get_string("maxmemory-policy", "noeviction") << "\r\n\r\n";
    }

    if (sec == "all" || sec == "persistence" || sec == "default") {
        ss << "# Persistence\r\n";
        ss << "loading:0\r\n";
        ss << "rdb_last_save_time:" << (core::wall_now_ms() / 1000) << "\r\n";
        ss << "aof_enabled:" << (config_mgr.get_bool("appendonly", false) ? 1 : 0) << "\r\n\r\n";
    }

    if (sec == "all" || sec == "stats" || sec == "default") {
        ss << "# Stats\r\n";
        ss << "total_connections_received:" << stats.total_connections_received << "\r\n";
        ss << "total_commands_processed:" << stats.total_commands_processed << "\r\n";
        ss << "instantaneous_ops_per_sec:0\r\n";
        ss << "rejected_connections:" << stats.rejected_connections << "\r\n";
        ss << "expired_keys:" << stats.expired_keys << "\r\n";
        ss << "evicted_keys:" << stats.evicted_keys << "\r\n";
        ss << "keyspace_hits:" << stats.keyspace_hits << "\r\n";
        ss << "keyspace_misses:" << stats.keyspace_misses << "\r\n\r\n";
    }

    if (sec == "all" || sec == "replication" || sec == "default") {
        bool is_slave = repl_ctx.replica_link.is_replica_mode();
        ss << "# Replication\r\n";
        ss << "role:" << (is_slave ? "slave" : "master") << "\r\n";
        if (is_slave) {
            ss << "master_host:" << repl_ctx.replica_link.master_host() << "\r\n";
            ss << "master_port:" << repl_ctx.replica_link.master_port() << "\r\n";
            ss << "slave_read_only:1\r\n";
        } else {
            ss << "connected_slaves:" << repl_ctx.repl_stream.replicas().size() << "\r\n";
            ss << "master_replid:" << repl_ctx.replid_mgr.master_replid() << "\r\n";
            ss << "master_repl_offset:" << repl_ctx.replid_mgr.master_repl_offset() << "\r\n";
        }
        ss << "\r\n";
    }

    if (sec == "all" || sec == "keyspace" || sec == "default") {
        ss << "# Keyspace\r\n";
        for (std::size_t i = 0; i < db::Keyspace::NUM_DATABASES; ++i) {
            std::size_t sz = keyspace.db_size(i);
            if (sz > 0) {
                ss << "db" << i << ":keys=" << sz << ",expires=0,avg_ttl=0\r\n";
            }
        }
    }

    return ss.str();
}

void register_info_commands(
    commands::Dispatcher &dispatcher,
    const db::Keyspace &keyspace,
    const memory::EvictionManager &evict_mgr,
    const commands::ReplicationContext &repl_ctx,
    const config::ConfigManager &config_mgr,
    ServerStats &stats,
    const net::Listener *listener
) {
    dispatcher.register_command({"INFO", -1, commands::CMD_FLAG_READONLY, [&keyspace, &evict_mgr, &repl_ctx, &config_mgr, &stats, listener](
                                                                               const proto::Command &cmd,
                                                                               db::Keyspace &,
                                                                               std::size_t,
                                                                               core::Buffer &out_buf,
                                                                               std::size_t &
                                                                           ) {
        std::string section = (cmd.arg_count() >= 2) ? cmd.arg(1) : "all";
        std::size_t conn_clients = listener ? listener->active_clients_count() : 1;
        std::string res = InfoProvider::generate_info(section, keyspace, evict_mgr, repl_ctx, config_mgr, stats, conn_clients, 0);
        proto::RespWriter::write_bulk_string(out_buf, res);
    }});
}

} // namespace redisx::obs
