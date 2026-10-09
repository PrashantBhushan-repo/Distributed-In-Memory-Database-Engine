#include "redisx/obs/latency.h"
#include "redisx/core/time.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <sstream>

namespace redisx::obs {

void LatencyMonitor::record_latency(const std::string &event_name, std::uint64_t latency_ms, std::uint64_t threshold_ms) {
    if (latency_ms < threshold_ms) return;
    LatencySample sample{core::wall_now_ms() / 1000, latency_ms};
    auto &deque = history_[event_name];
    deque.push_front(sample);
    if (deque.size() > 160) deque.pop_back();
}

std::unordered_map<std::string, LatencySample> LatencyMonitor::get_latest() const {
    std::unordered_map<std::string, LatencySample> res;
    for (const auto &[event, deque] : history_) {
        if (!deque.empty()) {
            res[event] = deque.front();
        }
    }
    return res;
}

std::vector<LatencySample> LatencyMonitor::get_history(const std::string &event_name) const {
    auto it = history_.find(event_name);
    if (it != history_.end()) {
        return std::vector<LatencySample>(it->second.begin(), it->second.end());
    }
    return {};
}

void LatencyMonitor::reset(const std::string &event_name) {
    if (event_name.empty()) {
        history_.clear();
    } else {
        history_.erase(event_name);
    }
}

std::string LatencyMonitor::doctor_report() const {
    if (history_.empty()) {
        return "Dave, no high latency events observed so far. Everything is clean.";
    }
    std::ostringstream ss;
    ss << "Dave, I have observed " << history_.size() << " latency event types:\n";
    for (const auto &[event, deque] : history_) {
        if (!deque.empty()) {
            ss << "- " << event << ": peak " << deque.front().latency_ms << "ms at timestamp " << deque.front().timestamp << "\n";
        }
    }
    return ss.str();
}

void register_latency_commands(commands::Dispatcher &dispatcher, LatencyMonitor &latency_mon) {
    // LATENCY LATEST/HISTORY/RESET/DOCTOR
    dispatcher.register_command({"LATENCY", -2, commands::CMD_FLAG_ADMIN, [&latency_mon](
                                                                               const proto::Command &cmd,
                                                                               db::Keyspace &,
                                                                               std::size_t,
                                                                               core::Buffer &out_buf,
                                                                               std::size_t &
                                                                           ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "LATEST") {
            auto latest = latency_mon.get_latest();
            proto::RespWriter::write_array_header(out_buf, latest.size());
            for (const auto &[event, sample] : latest) {
                proto::RespWriter::write_array_header(out_buf, 4);
                proto::RespWriter::write_bulk_string(out_buf, event);
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(sample.timestamp));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(sample.latency_ms));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(sample.latency_ms));
            }
        } else if (sub == "HISTORY" && cmd.arg_count() >= 3) {
            auto hist = latency_mon.get_history(cmd.arg(2));
            proto::RespWriter::write_array_header(out_buf, hist.size());
            for (const auto &sample : hist) {
                proto::RespWriter::write_array_header(out_buf, 2);
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(sample.timestamp));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(sample.latency_ms));
            }
        } else if (sub == "RESET") {
            std::string event = (cmd.arg_count() >= 3) ? cmd.arg(2) : "";
            latency_mon.reset(event);
            proto::RespWriter::write_integer(out_buf, 1);
        } else if (sub == "DOCTOR") {
            proto::RespWriter::write_bulk_string(out_buf, latency_mon.doctor_report());
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown LATENCY subcommand '" + cmd.arg(1) + "'");
        }
    }});
}

} // namespace redisx::obs
