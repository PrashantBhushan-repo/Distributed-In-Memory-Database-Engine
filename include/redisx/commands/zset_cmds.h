#ifndef REDISX_COMMANDS_ZSET_CMDS_H
#define REDISX_COMMANDS_ZSET_CMDS_H

#include "redisx/commands/dispatcher.h"

namespace redisx::commands {

void register_zset_commands(Dispatcher &dispatcher);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_ZSET_CMDS_H
