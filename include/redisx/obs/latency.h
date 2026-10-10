#ifndef REDISX_OBS_LATENCY_H
#define REDISX_OBS_LATENCY_H

#include "redisx/commands/dispatcher.h"

#include <cstdint>
#include <deque>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace redisx::obs {

struct LatencySample {
    std::uint64_t timestamp;
    std::uint64_t latency_ms;
};

class LatencyMonitor {
  public:
    LatencyMonitor() = default;

    void record_latency(const std::string &event_name, std::uint64_t latency_ms, std::uint64_t threshold_ms = 0);

    [[nodiscard]] std::unordered_map<std::string, LatencySample> get_latest() const;
    [[nodiscard]] std::vector<LatencySample> get_history(const std::string &event_name) const;
    void reset(const std::string &event_name = "");
    [[nodiscard]] std::string doctor_report() const;

  private:
    std::unordered_map<std::string, std::deque<LatencySample>> history_;
};

void register_latency_commands(commands::Dispatcher &dispatcher, LatencyMonitor &latency_mon);

} // namespace redisx::obs

#endif // REDISX_OBS_LATENCY_H
