#ifndef REDISX_PERSISTENCE_SNAPSHOT_WRITER_H
#define REDISX_PERSISTENCE_SNAPSHOT_WRITER_H

#include "redisx/db/keyspace.h"

#include <cstdint>
#include <string>

namespace redisx::persistence {

class SnapshotWriter {
  public:
    SnapshotWriter() = default;

    // Writes the keyspace state to filepath atomically (via filepath + ".tmp" and rename)
    bool write_snapshot(const db::Keyspace &keyspace, const std::string &filepath);
};

} // namespace redisx::persistence

#endif // REDISX_PERSISTENCE_SNAPSHOT_WRITER_H
