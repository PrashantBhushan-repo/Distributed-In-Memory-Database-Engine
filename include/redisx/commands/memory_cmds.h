#ifndef REDISX_COMMANDS_MEMORY_CMDS_H
#define REDISX_COMMANDS_MEMORY_CMDS_H

#include "redisx/commands/dispatcher.h"
#include "redisx/memory/eviction.h"

namespace redisx::commands {

void register_memory_commands(Dispatcher &dispatcher, memory::EvictionManager &evict_mgr);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_MEMORY_CMDS_H
