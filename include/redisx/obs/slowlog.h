#ifndef REDISX_OBS_SLOWLOG_H
#define REDISX_OBS_SLOWLOG_H

#include "redisx/commands/dispatcher.h"
#include "redisx/proto/command.h"

#include <cstdint>
#include <deque>
#include <string>
#include <vector>

namespace redisx::obs {

struct SlowlogEntry {
    std::uint64_t id;
    std::uint64_t timestamp;
    std::uint64_t duration_us;
    std::vector<std::string> args;
    std::string client_addr;
    std::string client_name;
};

class SlowlogManager {
  public:
    SlowlogManager() = default;

    void log_command(
        const proto::Command &cmd,
        std::uint64_t duration_us,
        std::int64_t threshold_us = 10000,
        std::size_t max_len = 128,
        const std::string &client_addr = "127.0.0.1:6379",
        const std::string &client_name = ""
    );

    [[nodiscard]] std::vector<SlowlogEntry> get_entries(std::int64_t count = -1) const;
    void reset();
    [[nodiscard]] std::size_t len() const noexcept { return entries_.size(); }

  private:
    std::deque<SlowlogEntry> entries_;
    std::uint64_t next_id_{0};
};

void register_slowlog_commands(commands::Dispatcher &dispatcher, SlowlogManager &slowlog_mgr);

} // namespace redisx::obs

#endif // REDISX_OBS_SLOWLOG_H
