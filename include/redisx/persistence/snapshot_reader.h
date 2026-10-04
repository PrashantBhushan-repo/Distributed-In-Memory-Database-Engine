#ifndef REDISX_PERSISTENCE_SNAPSHOT_READER_H
#define REDISX_PERSISTENCE_SNAPSHOT_READER_H

#include "redisx/core/errors.h"
#include "redisx/db/keyspace.h"

#include <string>

namespace redisx::persistence {

class SnapshotReader {
  public:
    SnapshotReader() = default;

    // Deserializes binary snapshot file into keyspace and validates CRC64
    core::Result<void> load_snapshot(db::Keyspace &keyspace, const std::string &filepath);
};

} // namespace redisx::persistence

#endif // REDISX_PERSISTENCE_SNAPSHOT_READER_H
