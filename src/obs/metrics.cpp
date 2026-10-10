#include "redisx/obs/metrics.h"
#include "redisx/core/time.h"
#include "redisx/memory/accounting.h"

#include <sstream>

namespace redisx::obs {

std::string PrometheusExporter::generate_metrics(
    const db::Keyspace &keyspace,
    const memory::EvictionManager &evict_mgr,
    const commands::ReplicationContext &repl_ctx,
    const ServerStats &stats,
    std::size_t connected_clients,
    const db::TTLManager *ttl_mgr
) {
    std::ostringstream ss;
    ss << "# HELP redis_uptime_in_seconds Total uptime in seconds\n";
    ss << "# TYPE redis_uptime_in_seconds gauge\n";
    std::uint64_t uptime = (core::monotonic_now_ms() - stats.start_time_ms) / 1000;
    ss << "redis_uptime_in_seconds " << uptime << "\n\n";

    ss << "# HELP redis_connected_clients Number of connected clients\n";
    ss << "# TYPE redis_connected_clients gauge\n";
    ss << "redis_connected_clients " << connected_clients << "\n\n";

    ss << "# HELP redis_memory_used_bytes Memory used by database engine\n";
    ss << "# TYPE redis_memory_used_bytes gauge\n";
    ss << "redis_memory_used_bytes " << memory::MemoryTracker::instance().used_memory() << "\n\n";

    ss << "# HELP redis_memory_max_bytes Max memory limit\n";
    ss << "# TYPE redis_memory_max_bytes gauge\n";
    ss << "redis_memory_max_bytes " << evict_mgr.maxmemory() << "\n\n";

    ss << "# HELP redis_commands_processed_total Total processed commands counter\n";
    ss << "# TYPE redis_commands_processed_total counter\n";
    ss << "redis_commands_processed_total " << stats.total_commands_processed << "\n\n";

    ss << "# HELP redis_connections_received_total Total connections received counter\n";
    ss << "# TYPE redis_connections_received_total counter\n";
    ss << "redis_connections_received_total " << stats.total_connections_received << "\n\n";

    std::uint64_t expired = (ttl_mgr != nullptr) ? ttl_mgr->stats().expired_keys : stats.expired_keys;
    std::uint64_t evicted = evict_mgr.evicted_keys();

    ss << "# HELP redis_expired_keys_total Total expired keys counter\n";
    ss << "# TYPE redis_expired_keys_total counter\n";
    ss << "redis_expired_keys_total " << expired << "\n\n";

    ss << "# HELP redis_evicted_keys_total Total evicted keys counter\n";
    ss << "# TYPE redis_evicted_keys_total counter\n";
    ss << "redis_evicted_keys_total " << evicted << "\n\n";

    ss << "# HELP redis_keyspace_hits_total Total keyspace hits counter\n";
    ss << "# TYPE redis_keyspace_hits_total counter\n";
    ss << "redis_keyspace_hits_total " << stats.keyspace_hits << "\n\n";

    ss << "# HELP redis_keyspace_misses_total Total keyspace misses counter\n";
    ss << "# TYPE redis_keyspace_misses_total counter\n";
    ss << "redis_keyspace_misses_total " << stats.keyspace_misses << "\n\n";

    ss << "# HELP redis_replication_offset Current replication offset\n";
    ss << "# TYPE redis_replication_offset gauge\n";
    ss << "redis_replication_offset " << repl_ctx.replid_mgr.master_repl_offset() << "\n\n";

    for (std::size_t i = 0; i < db::Keyspace::NUM_DATABASES; ++i) {
        std::size_t sz = keyspace.db_size(i);
        if (sz > 0) {
            ss << "redis_keyspace_keys{db=\"db" << i << "\"} " << sz << "\n";
        }
    }

    return ss.str();
}

} // namespace redisx::obs
