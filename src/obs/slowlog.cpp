#include "redisx/obs/slowlog.h"
#include "redisx/core/time.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>

namespace redisx::obs {

void SlowlogManager::log_command(
    const proto::Command &cmd,
    std::uint64_t duration_us,
    std::int64_t threshold_us,
    std::size_t max_len,
    const std::string &client_addr,
    const std::string &client_name
) {
    if (threshold_us < 0 || static_cast<std::int64_t>(duration_us) < threshold_us) {
        return;
    }

    SlowlogEntry entry;
    entry.id = next_id_++;
    entry.timestamp = core::wall_now_ms() / 1000;
    entry.duration_us = duration_us;
    entry.args = cmd.args();
    entry.client_addr = client_addr;
    entry.client_name = client_name;

    entries_.push_front(std::move(entry));
    while (entries_.size() > max_len && max_len > 0) {
        entries_.pop_back();
    }
}

std::vector<SlowlogEntry> SlowlogManager::get_entries(std::int64_t count) const {
    std::vector<SlowlogEntry> res;
    std::size_t limit = (count <= 0) ? entries_.size() : std::min(entries_.size(), static_cast<std::size_t>(count));
    for (std::size_t i = 0; i < limit; ++i) {
        res.push_back(entries_[i]);
    }
    return res;
}

void SlowlogManager::reset() {
    entries_.clear();
}

void register_slowlog_commands(commands::Dispatcher &dispatcher, SlowlogManager &slowlog_mgr) {
    // SLOWLOG GET/RESET/LEN
    dispatcher.register_command({"SLOWLOG", -2, commands::CMD_FLAG_ADMIN, [&slowlog_mgr](
                                                                                const proto::Command &cmd,
                                                                                db::Keyspace &,
                                                                                std::size_t,
                                                                                core::Buffer &out_buf,
                                                                                std::size_t &
                                                                            ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "GET") {
            std::int64_t count = -1;
            if (cmd.arg_count() >= 3) {
                try { count = std::stoll(cmd.arg(2)); } catch (...) {}
            }
            auto entries = slowlog_mgr.get_entries(count);
            proto::RespWriter::write_array_header(out_buf, entries.size());
            for (const auto &e : entries) {
                proto::RespWriter::write_array_header(out_buf, 6);
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(e.id));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(e.timestamp));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(e.duration_us));
                proto::RespWriter::write_string_array(out_buf, e.args);
                proto::RespWriter::write_bulk_string(out_buf, e.client_addr);
                proto::RespWriter::write_bulk_string(out_buf, e.client_name);
            }
        } else if (sub == "RESET") {
            slowlog_mgr.reset();
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else if (sub == "LEN") {
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(slowlog_mgr.len()));
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown SLOWLOG subcommand '" + cmd.arg(1) + "'");
        }
    }});
}

} // namespace redisx::obs
