#ifndef REDISX_COMMANDS_PERSIST_CMDS_H
#define REDISX_COMMANDS_PERSIST_CMDS_H

namespace redisx::commands {

class Dispatcher;

void register_persist_commands(Dispatcher &dispatcher);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_PERSIST_CMDS_H
