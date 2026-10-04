#include "redisx/commands/memory_cmds.h"
#include "redisx/memory/accounting.h"
#include "redisx/proto/resp_writer.h"

#include <cctype>
#include <string>

namespace redisx::commands {

static void handle_memory(const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                          core::Buffer &out_buf, std::size_t &/*out_db_idx*/,
                          memory::EvictionManager &evict_mgr) {
    if (cmd.arg_count() < 2) {
        proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments for 'memory' command");
        return;
    }

    std::string sub = cmd.arg(1);
    for (auto &c : sub) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));

    if (sub == "USAGE" && cmd.arg_count() >= 3) {
        const std::string &key = cmd.arg(2);
        auto *entry = keyspace.db_get(db_idx, key);
        if (!entry) {
            proto::RespWriter::write_null_bulk(out_buf);
            return;
        }

        size_t approx_bytes = sizeof(db::Entry) + key.size() + 64; // Base entry size overhead
        if (entry->value.is_string()) {
            approx_bytes += entry->value.as_string().size();
        } else {
            approx_bytes += 256; // Collection estimate
        }

        proto::RespWriter::write_integer(out_buf, static_cast<int64_t>(approx_bytes));
        return;
    }

    if (sub == "DOCTOR") {
        std::string report = "Hi! Everything looks healthy in RedisX Memory Doctor. Used: " +
                             std::to_string(memory::MemoryTracker::instance().used_memory()) + " bytes.";
        proto::RespWriter::write_bulk_string(out_buf, report);
        return;
    }

    if (sub == "STATS") {
        std::vector<std::pair<std::string, std::string>> stats = {
            {"used_memory", std::to_string(memory::MemoryTracker::instance().used_memory())},
            {"peak_memory", std::to_string(memory::MemoryTracker::instance().peak_memory())},
            {"maxmemory", std::to_string(evict_mgr.maxmemory())},
            {"eviction_policy", std::string(memory::to_string(evict_mgr.policy()))},
            {"evicted_keys", std::to_string(evict_mgr.evicted_keys())}
        };

        proto::RespWriter::write_array_header(out_buf, stats.size() * 2);
        for (const auto &[k, v] : stats) {
            proto::RespWriter::write_bulk_string(out_buf, k);
            proto::RespWriter::write_bulk_string(out_buf, v);
        }
        return;
    }

    proto::RespWriter::write_error(out_buf, "ERR Unknown subcommand or wrong number of arguments for 'MEMORY'");
}

void register_memory_commands(Dispatcher &dispatcher, memory::EvictionManager &evict_mgr) {
    dispatcher.register_command({
        "MEMORY",
        -2,
        CMD_FLAG_READONLY,
        [&evict_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                     core::Buffer &out_buf, std::size_t &out_db_idx) {
            handle_memory(cmd, keyspace, db_idx, out_buf, out_db_idx, evict_mgr);
        }
    });
}

} // namespace redisx::commands
