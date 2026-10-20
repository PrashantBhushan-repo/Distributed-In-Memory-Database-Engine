#ifndef REDISX_PERSISTENCE_AOF_H
#define REDISX_PERSISTENCE_AOF_H

#include "redisx/db/keyspace.h"

#include <cstddef>
#include <cstdint>
#include <fstream>
#include <mutex>
#include <string>
#include <vector>

namespace redisx::persistence {

enum class FsyncPolicy : std::uint8_t {
    Always = 0,
    EverySec,
    No
};

class AofManager {
  public:
    AofManager() = default;
    ~AofManager() { close(); }

    AofManager(const AofManager &) = delete;
    AofManager &operator=(const AofManager &) = delete;

    bool open(const std::string &filepath, FsyncPolicy policy = FsyncPolicy::EverySec);
    void close();

    [[nodiscard]] bool is_open() const noexcept { return is_open_; }
    [[nodiscard]] FsyncPolicy policy() const noexcept { return policy_; }
    void set_policy(FsyncPolicy p) noexcept { policy_ = p; }

    // Appends a mutating command to the AOF log
    bool append_command(std::size_t db_idx, const std::vector<std::string> &args);

    // Forces OS buffer flush and fsync
    bool flush_and_fsync();
    [[nodiscard]] bool healthy() const noexcept { return healthy_; }
    bool install_rewrite(const std::string &temporary_path);

    // Compacts AOF log by dumping current keyspace state into target_filepath
    bool rewrite(const db::Keyspace &keyspace, const std::string &target_filepath);

    // Start/Finish BGREWRITEAOF buffer mode
    void start_rewrite_buffer();
    void stop_rewrite_buffer_and_append(std::ofstream &target_out);

  private:
    std::string filepath_;
    int fd_{-1};
    bool healthy_{true};
    FsyncPolicy policy_{FsyncPolicy::EverySec};
    bool is_open_{false};
    std::size_t current_db_{db::Keyspace::NUM_DATABASES};

    // AOF rewrite buffering
    bool is_rewriting_{false};
    std::string rewrite_buffer_;
    std::mutex mutex_;
};

} // namespace redisx::persistence

#endif // REDISX_PERSISTENCE_AOF_H
