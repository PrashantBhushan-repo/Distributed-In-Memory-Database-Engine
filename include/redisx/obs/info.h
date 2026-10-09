#ifndef REDISX_OBS_INFO_H
#define REDISX_OBS_INFO_H

#include "redisx/commands/dispatcher.h"
#include "redisx/commands/repl_cmds.h"
#include "redisx/config/config.h"
#include "redisx/db/keyspace.h"
#include "redisx/memory/eviction.h"

#include <cstdint>
#include <string>

#include "redisx/net/listener.h"

namespace redisx::obs {

struct ServerStats {
    std::uint64_t start_time_ms{0};
    std::uint64_t total_connections_received{0};
    std::uint64_t total_commands_processed{0};
    std::uint64_t rejected_connections{0};
    std::uint64_t keyspace_hits{0};
    std::uint64_t keyspace_misses{0};
    std::uint64_t expired_keys{0};
    std::uint64_t evicted_keys{0};
};

class InfoProvider {
  public:
    static std::string generate_info(
        const std::string &section,
        const db::Keyspace &keyspace,
        const memory::EvictionManager &evict_mgr,
        const commands::ReplicationContext &repl_ctx,
        const config::ConfigManager &config_mgr,
        const ServerStats &stats,
        std::size_t connected_clients,
        std::size_t blocked_clients
    );
};

void register_info_commands(
    commands::Dispatcher &dispatcher,
    const db::Keyspace &keyspace,
    const memory::EvictionManager &evict_mgr,
    const commands::ReplicationContext &repl_ctx,
    const config::ConfigManager &config_mgr,
    ServerStats &stats,
    const net::Listener *listener = nullptr
);

} // namespace redisx::obs

#endif // REDISX_OBS_INFO_H
