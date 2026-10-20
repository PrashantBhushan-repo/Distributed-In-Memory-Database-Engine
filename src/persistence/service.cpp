#include "redisx/persistence/service.h"
#include "redisx/persistence/snapshot_writer.h"
#include "redisx/core/time.h"
#include "redisx/core/logging.h"
#include <algorithm>
#include <filesystem>
#include <sstream>
#include <charconv>
#include <sys/wait.h>
#include <unistd.h>
namespace redisx::persistence {
PersistenceService::PersistenceService(const config::ConfigManager &config) : config_(config) {
    const auto dir = std::filesystem::path(config.get_string("dir", "."));
    snapshot_path_ = (dir / config.get_string("dbfilename", "dump.rdb")).string();
    aof_path_ = (dir / config.get_string("appendfilename", "appendonly.aof")).string();
    rewrite_path_ = aof_path_ + ".rewrite";
    enabled_ = config.get_bool("appendonly");
    last_save_time_ = core::wall_now_ms() / 1000;
    last_fsync_ms_ = last_save_ms_ = core::monotonic_now_ms();
}
PersistenceService::~PersistenceService() {
    for (const int pid : {save_pid_, rewrite_pid_}) {
        if (pid > 0) { int status; while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {} }
    }
}
bool PersistenceService::open() {
    std::istringstream rules(config_.get_string("save"));
    std::string first, second;
    while (rules >> first) {
        if (!(rules >> second)) {
            REDISX_LOG_ERROR("Invalid save schedule: expected pairs of seconds and changes");
            return false;
        }
        std::uint64_t seconds = 0, changes = 0;
        auto [seconds_end, seconds_error] = std::from_chars(first.data(), first.data() + first.size(), seconds);
        auto [changes_end, changes_error] = std::from_chars(second.data(), second.data() + second.size(), changes);
        if (seconds_error != std::errc{} || changes_error != std::errc{} || seconds_end != first.data() + first.size() || changes_end != second.data() + second.size() || !seconds || !changes) {
            REDISX_LOG_ERROR("Invalid save schedule: seconds and changes must be positive integers");
            return false;
        }
        save_rules_.emplace_back(seconds, changes);
    }
    if (!enabled_) return true;
    const auto policy = config_.get_string("appendfsync", "everysec");
    return aof_.open(aof_path_, policy == "always" ? FsyncPolicy::Always : policy == "no" ? FsyncPolicy::No : FsyncPolicy::EverySec);
}
bool PersistenceService::append(std::size_t db, const std::vector<std::string> &args) {
    if (!args.empty() && args[0] == "MULTI") { if (transaction_depth_++ != 0) return true; }
    if (!args.empty() && args[0] == "EXEC") { if (transaction_depth_ == 0) return false; if (--transaction_depth_ != 0) return true; }
    ++dirty_;
    return !enabled_ || aof_.append_command(db, args);
}
bool PersistenceService::replace_from_full_sync(const db::Keyspace &keys) {
    reap_children();
    // A child based on the previous dataset must not later overwrite the new base.
    if (save_pid_ > 0 || rewrite_pid_ > 0) return false;
    if (!enabled_) return save(keys);
    AofManager compact;
    if (!compact.rewrite(keys, rewrite_path_)) return false;
    compact.close();
    aof_.start_rewrite_buffer();
    if (!aof_.install_rewrite(rewrite_path_)) return false;
    dirty_ = 0;
    return true;
}
bool PersistenceService::save(const db::Keyspace &keys) {
    if (saving() || !SnapshotWriter{}.write_snapshot(keys, snapshot_path_)) return false;
    last_save_time_ = core::wall_now_ms() / 1000;
    last_save_ms_ = core::monotonic_now_ms(); dirty_ = 0;
    return true;
}
bool PersistenceService::background_save(const db::Keyspace &keys) {
    reap_children();
    if (saving()) return false;
    const auto pid = ::fork();
    if (pid < 0) return false;
    if (pid == 0) ::_exit(SnapshotWriter{}.write_snapshot(keys, snapshot_path_) ? 0 : 1);
    save_pid_ = pid; saving_dirty_ = dirty_;
    return true;
}
bool PersistenceService::background_rewrite(const db::Keyspace &keys) {
    reap_children();
    if (!enabled_ || rewrite_pid_ > 0 || !aof_.healthy()) return false;
    aof_.start_rewrite_buffer();
    const auto pid = ::fork();
    if (pid == 0) {
        AofManager compact;
        ::_exit(compact.rewrite(keys, rewrite_path_) ? 0 : 1);
    }
    if (pid < 0) { std::ofstream discard; aof_.stop_rewrite_buffer_and_append(discard); return false; }
    rewrite_pid_ = pid;
    return true;
}
void PersistenceService::reap_children() {
    int status = 0;
    if (save_pid_ > 0 && ::waitpid(save_pid_, &status, WNOHANG) == save_pid_) {
        if (WIFEXITED(status) && WEXITSTATUS(status) == 0) {
            last_save_time_ = core::wall_now_ms() / 1000;
            last_save_ms_ = core::monotonic_now_ms();
            dirty_ -= std::min(dirty_, saving_dirty_);
        } else REDISX_LOG_ERROR("Background snapshot failed");
        save_pid_ = -1;
    }
    if (rewrite_pid_ > 0 && ::waitpid(rewrite_pid_, &status, WNOHANG) == rewrite_pid_) {
        if (!(WIFEXITED(status) && WEXITSTATUS(status) == 0 && aof_.install_rewrite(rewrite_path_))) {
            std::ofstream discard; aof_.stop_rewrite_buffer_and_append(discard);
            REDISX_LOG_ERROR("Background AOF rewrite failed; original append log retained");
        }
        rewrite_pid_ = -1;
    }
}
void PersistenceService::tick(const db::Keyspace &keys) {
    reap_children();
    const auto now = core::monotonic_now_ms();
    if (enabled_ && aof_.policy() == FsyncPolicy::EverySec && now - last_fsync_ms_ >= 1000) {
        if (!aof_.flush_and_fsync()) REDISX_LOG_ERROR("AOF fsync failed; writes are disabled");
        last_fsync_ms_ = now;
    }
    for (const auto &[seconds, changes] : save_rules_) {
        if (!saving() && dirty_ >= changes && (now - last_save_ms_) / 1000 >= seconds) {
            if (!background_save(keys)) REDISX_LOG_ERROR("Could not start scheduled snapshot");
            break;
        }
    }
}
}
