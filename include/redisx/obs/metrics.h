#ifndef REDISX_OBS_METRICS_H
#define REDISX_OBS_METRICS_H

#include "redisx/commands/repl_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/memory/eviction.h"
#include "redisx/obs/info.h"

#include <cstdint>
#include <string>

namespace redisx::obs {

class PrometheusExporter {
  public:
    static std::string generate_metrics(
        const db::Keyspace &keyspace,
        const memory::EvictionManager &evict_mgr,
        const commands::ReplicationContext &repl_ctx,
        const ServerStats &stats,
        std::size_t connected_clients,
        const db::TTLManager *ttl_mgr = nullptr
    );
};

} // namespace redisx::obs

#endif // REDISX_OBS_METRICS_H
