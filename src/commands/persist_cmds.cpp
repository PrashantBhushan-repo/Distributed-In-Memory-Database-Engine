#include "redisx/commands/persist_cmds.h"
#include "redisx/commands/dispatcher.h"
#include "redisx/persistence/snapshot_writer.h"
#include "redisx/persistence/aof.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"

#include <atomic>
#include <chrono>
#include <thread>

namespace redisx::commands {

static std::atomic<std::uint64_t> g_last_save_time{0};
static std::atomic<bool> g_bgsave_in_progress{false};

void register_persist_commands(Dispatcher &dispatcher) {
    // 1. SAVE (synchronous snapshot)
    dispatcher.register_command({
        "SAVE", 1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [](const proto::Command &, db::Keyspace &keyspace, std::size_t, core::Buffer &out, std::size_t &) {
            persistence::SnapshotWriter writer;
            if (writer.write_snapshot(keyspace, "dump.rdb")) {
                std::uint64_t now = core::get_global_time_provider()->wall_now_ms() / 1000;
                g_last_save_time.store(now);
                proto::RespWriter::write_simple_string(out, "OK");
            } else {
                proto::RespWriter::write_error(out, "ERR Could not save snapshot");
            }
        }
    });

    // 2. BGSAVE (background snapshot)
    dispatcher.register_command({
        "BGSAVE", -1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [](const proto::Command &, db::Keyspace &keyspace, std::size_t, core::Buffer &out, std::size_t &) {
            if (g_bgsave_in_progress.exchange(true)) {
                proto::RespWriter::write_error(out, "ERR Background save already in progress");
                return;
            }

            // Spawn background worker thread
            std::thread([&keyspace]() {
                persistence::SnapshotWriter writer;
                if (writer.write_snapshot(keyspace, "dump.rdb")) {
                    std::uint64_t now = core::get_global_time_provider()->wall_now_ms() / 1000;
                    g_last_save_time.store(now);
                    REDISX_LOG_INFO("Background saving terminated with success");
                } else {
                    REDISX_LOG_ERROR("Background saving failed");
                }
                g_bgsave_in_progress.store(false);
            }).detach();

            proto::RespWriter::write_simple_string(out, "Background saving started");
        }
    });

    // 3. BGREWRITEAOF
    dispatcher.register_command({
        "BGREWRITEAOF", 1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [](const proto::Command &, db::Keyspace &keyspace, std::size_t, core::Buffer &out, std::size_t &) {
            std::thread([&keyspace]() {
                persistence::AofManager aof;
                if (aof.rewrite(keyspace, "appendonly.aof")) {
                    REDISX_LOG_INFO("Background AOF rewrite terminated with success");
                } else {
                    REDISX_LOG_ERROR("Background AOF rewrite failed");
                }
            }).detach();

            proto::RespWriter::write_simple_string(out, "Background append only file rewriting started");
        }
    });

    // 4. LASTSAVE
    dispatcher.register_command({
        "LASTSAVE", 1, CMD_FLAG_READONLY,
        [](const proto::Command &, db::Keyspace &, std::size_t, core::Buffer &out, std::size_t &) {
            std::uint64_t ts = g_last_save_time.load();
            if (ts == 0) {
                ts = core::get_global_time_provider()->wall_now_ms() / 1000;
            }
            proto::RespWriter::write_integer(out, static_cast<std::int64_t>(ts));
        }
    });
}

} // namespace redisx::commands
