#include "redisx/persistence/recovery.h"
#include "redisx/persistence/snapshot_reader.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/core/buffer.h"
#include "redisx/core/logging.h"

#include <filesystem>
#include <fstream>
#include <vector>

namespace redisx::persistence {

core::Result<void> RecoveryEngine::recover(
    db::Keyspace &keyspace,
    commands::Dispatcher &dispatcher,
    const std::string &rdb_path,
    const std::string &aof_path,
    const RecoveryOptions &opts) {

    // Step 1: Load Snapshot (RDB) if present
    if (!rdb_path.empty() && std::filesystem::exists(rdb_path)) {
        REDISX_LOG_INFO("Loading RDB snapshot from %s", rdb_path.c_str());
        SnapshotReader reader;
        auto res = reader.load_snapshot(keyspace, rdb_path);
        if (res.is_error() && res.error() != core::ErrorCode::NotFound) {
            REDISX_LOG_ERROR("Failed to load snapshot file %s: error code %d", rdb_path.c_str(), static_cast<int>(res.error()));
            return res;
        }
    }

    // Step 2: Replay AOF log if present
    if (!aof_path.empty() && std::filesystem::exists(aof_path)) {
        REDISX_LOG_INFO("Replaying AOF log from %s", aof_path.c_str());
        std::ifstream aof_file(aof_path, std::ios::binary);
        if (!aof_file.is_open()) {
            REDISX_LOG_ERROR("Failed to open AOF file %s", aof_path.c_str());
            return core::ErrorCode::IoError;
        }

        core::Buffer in_buf;
        std::size_t active_db = 0;
        std::vector<char> file_chunk(4096);
        bool parse_error = false;

        while (aof_file.read(file_chunk.data(), static_cast<std::streamsize>(file_chunk.size())) || aof_file.gcount() > 0) {
            std::size_t bytes_read = static_cast<std::size_t>(aof_file.gcount());
            in_buf.append(file_chunk.data(), bytes_read);

            while (in_buf.readable_bytes() > 0) {
                auto result = proto::RespReader::parse(in_buf);
                if (result.is_error()) {
                    parse_error = true;
                    break;
                }

                if (!result.value().has_value()) {
                    break; // Incomplete command, wait for more bytes
                }

                const auto &cmd = result.value().value();
                if (cmd.empty()) continue;

                std::string name_upper = cmd.name_upper();
                if (name_upper == "SELECT" && cmd.arg_count() == 2) {
                    try {
                        std::size_t db_idx = static_cast<std::size_t>(std::stoul(cmd.arg(1)));
                        if (db::Keyspace::is_valid_db(db_idx)) {
                            active_db = db_idx;
                            continue;
                        }
                    } catch (...) {}
                }

                core::Buffer dummy_out;
                std::size_t out_db = active_db;
                dispatcher.dispatch(cmd, keyspace, active_db, dummy_out, out_db);
                active_db = out_db;
            }

            if (parse_error) break;
        }

        if (parse_error) {
            REDISX_LOG_ERROR("Corrupted AOF command stream in %s", aof_path.c_str());
            return core::ErrorCode::ProtocolError;
        }

        if (in_buf.readable_bytes() > 0) {
            if (opts.aof_load_truncated) {
                REDISX_LOG_WARN("AOF file ended with truncated final command (%llu unparsed bytes), continuing",
                                static_cast<unsigned long long>(in_buf.readable_bytes()));
            } else {
                REDISX_LOG_ERROR("Unparsed truncated command tail in %s", aof_path.c_str());
                return core::ErrorCode::ProtocolError;
            }
        }
    }

    return {};
}

} // namespace redisx::persistence
