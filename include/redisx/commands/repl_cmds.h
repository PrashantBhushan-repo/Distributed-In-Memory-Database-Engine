#ifndef REDISX_COMMANDS_REPL_CMDS_H
#define REDISX_COMMANDS_REPL_CMDS_H

#include "redisx/commands/dispatcher.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replica_link.h"
#include "redisx/replication/replid.h"

namespace redisx::commands {

struct ReplicationContext {
    replication::ReplIdManager &replid_mgr;
    replication::ReplBacklog &backlog;
    replication::ReplStream &repl_stream;
    replication::ReplicaLink &replica_link;
    std::uint16_t listening_port{6379};
};

void register_repl_commands(Dispatcher &dispatcher, ReplicationContext &repl_ctx);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_REPL_CMDS_H
