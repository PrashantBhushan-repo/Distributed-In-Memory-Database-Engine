#ifndef REDISX_PERSISTENCE_RECOVERY_H
#define REDISX_PERSISTENCE_RECOVERY_H

#include "redisx/commands/dispatcher.h"
#include "redisx/core/errors.h"
#include "redisx/db/keyspace.h"

#include <string>

namespace redisx::persistence {

struct RecoveryOptions {
    bool aof_load_truncated{true};
};

class RecoveryEngine {
  public:
    static core::Result<void> recover(
        db::Keyspace &keyspace,
        commands::Dispatcher &dispatcher,
        const std::string &rdb_path,
        const std::string &aof_path,
        const RecoveryOptions &opts = {}
    );
};

} // namespace redisx::persistence

#endif // REDISX_PERSISTENCE_RECOVERY_H
