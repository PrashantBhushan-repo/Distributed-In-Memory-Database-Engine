#ifndef REDISX_COMMANDS_ADMIN_CMDS_H
#define REDISX_COMMANDS_ADMIN_CMDS_H

#include "redisx/commands/dispatcher.h"
#include "redisx/net/connection.h"

#include <memory>
#include <string>
#include <unordered_map>

namespace redisx::commands {

void register_admin_commands(
    Dispatcher &dispatcher,
    std::unordered_map<int, std::shared_ptr<net::Connection>> &active_clients
);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_ADMIN_CMDS_H
