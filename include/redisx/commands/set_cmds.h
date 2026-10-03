#ifndef REDISX_COMMANDS_SET_CMDS_H
#define REDISX_COMMANDS_SET_CMDS_H

#include "redisx/commands/dispatcher.h"

namespace redisx::commands {

void register_set_commands(Dispatcher &dispatcher);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_SET_CMDS_H
