#ifndef REDISX_COMMANDS_EXPIRE_CMDS_H
#define REDISX_COMMANDS_EXPIRE_CMDS_H

#include "redisx/commands/dispatcher.h"
#include "redisx/db/ttl.h"

namespace redisx::commands {

// Registers EXPIRE, PEXPIRE, EXPIREAT, PEXPIREAT, TTL, PTTL, PERSIST commands
void register_expire_commands(Dispatcher &dispatcher, db::TTLManager &ttl_mgr);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_EXPIRE_CMDS_H
