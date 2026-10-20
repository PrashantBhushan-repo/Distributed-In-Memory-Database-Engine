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
    if (!( !aof_path.empty() && std::filesystem::exists(aof_path)) && !rdb_path.empty() && std::filesystem::exists(rdb_path)) {
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
        struct ReplayClock {
            bool previous = db::TTLManager::loading_aof;
            ReplayClock() { db::TTLManager::loading_aof = true; }
            ~ReplayClock() { db::TTLManager::loading_aof = previous; }
        } replay_clock;
        std::ifstream aof_file(aof_path, std::ios::binary);
        if (!aof_file.is_open()) {
            REDISX_LOG_ERROR("Failed to open AOF file %s", aof_path.c_str());
            return core::ErrorCode::IoError;
        }

        core::Buffer in_buf;
        std::size_t active_db = 0;
        std::uintmax_t consumed = 0, durable_end = 0, transaction_start = 0;
        bool in_transaction = false;
        std::vector<proto::Command> transaction;
        const auto apply = [&](const proto::Command &cmd) -> bool {
            const auto *spec = dispatcher.find_command(cmd.name_upper());
            if (!spec || (!(spec->flags & commands::CMD_FLAG_WRITE) && cmd.name_upper() != "SELECT")) return false;
            core::Buffer reply;
            std::size_t out_db = active_db;
            dispatcher.dispatch(cmd, keyspace, active_db, reply, out_db);
            if (reply.peek_string_view().starts_with("-")) return false;
            active_db = out_db;
            return true;
        };
        std::vector<char> chunk(4096);
        while (aof_file.read(chunk.data(), static_cast<std::streamsize>(chunk.size())) || aof_file.gcount() > 0) {
            in_buf.append(chunk.data(), static_cast<std::size_t>(aof_file.gcount()));
            while (in_buf.readable_bytes()) {
                const auto before = in_buf.readable_bytes();
                auto parsed = proto::RespReader::parse(in_buf);
                if (parsed.is_error()) return core::ErrorCode::ProtocolError;
                if (!parsed.value()) break;
                auto command = std::move(*parsed.value());
                const auto start = consumed;
                consumed += before - in_buf.readable_bytes();
                const auto name = command.name_upper();
                if (name == "MULTI" && command.arg_count() == 1 && !in_transaction) {
                    in_transaction = true; transaction_start = start; transaction.clear();
                } else if (name == "EXEC" && command.arg_count() == 1 && in_transaction) {
                    for (const auto &queued : transaction) if (!apply(queued)) return core::ErrorCode::ProtocolError;
                    transaction.clear(); in_transaction = false; durable_end = consumed;
                } else if (in_transaction) {
                    if (name == "MULTI" || name == "EXEC") return core::ErrorCode::ProtocolError;
                    transaction.push_back(std::move(command));
                } else {
                    if (!command.empty() && !apply(command)) return core::ErrorCode::ProtocolError;
                    durable_end = consumed;
                }
            }
        }
        if (aof_file.bad()) return core::ErrorCode::IoError;
        if (in_buf.readable_bytes() || in_transaction) {
            if (!opts.aof_load_truncated) return core::ErrorCode::ProtocolError;
            if (in_transaction) durable_end = transaction_start;
            aof_file.close();
            std::error_code error;
            std::filesystem::resize_file(aof_path, durable_end, error);
            if (error) return core::ErrorCode::IoError;
            REDISX_LOG_WARN("Removed an incomplete final AOF command/transaction from %s", aof_path.c_str());
        }

    }

    return {};
}

} // namespace redisx::persistence
