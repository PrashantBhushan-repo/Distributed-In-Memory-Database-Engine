#include "redisx/persistence/aof.h"
#include "redisx/core/fault_injection.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"
#include "redisx/core/file_io.h"
#include <charconv>

#include <cstdio>
#include <filesystem>
#include <limits>

#ifdef _WIN32
#include <io.h>
#define redisx_fsync(fd) _commit(fd)
#define redisx_fileno(file) _fileno(file)
#else
#include <unistd.h>
#define redisx_fsync(fd) fsync(fd)
#define redisx_fileno(file) fileno(file)
#endif

namespace redisx::persistence {

static std::string format_resp_cmd(const std::vector<std::string> &args) {
    std::string res;
    res += "*" + std::to_string(args.size()) + "\r\n";
    for (const auto &arg : args) {
        res += "$" + std::to_string(arg.size()) + "\r\n";
        res += arg + "\r\n";
    }
    return res;
}

namespace {
bool write_all(int fd, std::string_view bytes) {
    while (!bytes.empty()) {
        const auto written = ::write(fd, bytes.data(), bytes.size());
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) return false;
        bytes.remove_prefix(static_cast<std::size_t>(written));
    }
    return true;
}
}

bool AofManager::open(const std::string &filepath, FsyncPolicy policy) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (fd_ >= 0) ::close(fd_);
    filepath_ = filepath;
    policy_ = policy;
    fd_ = ::open(filepath.c_str(), O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
    is_open_ = fd_ >= 0;
    healthy_ = is_open_;
    current_db_ = db::Keyspace::NUM_DATABASES;
    return is_open_;
}

void AofManager::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (fd_ >= 0) { core::sync_fd(fd_); ::close(fd_); }
    fd_ = -1;
    is_open_ = false;
}

bool AofManager::append_command(std::size_t db_idx, const std::vector<std::string> &args) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!is_open_ || !healthy_ || args.empty()) return false;
    std::string payload;
    if (db_idx != current_db_) payload += format_resp_cmd({"SELECT", std::to_string(db_idx)});
    payload += format_resp_cmd(args);
    const auto start = ::lseek(fd_, 0, SEEK_END);
    if (FAILPOINT("aof_write") || !write_all(fd_, payload)) {
        if (start >= 0 && ::ftruncate(fd_, start) != 0) {
            ::close(fd_);
            fd_ = -1;
            is_open_ = false;
        }
        healthy_ = false;
        return false;
    }
    if (policy_ == FsyncPolicy::Always && (FAILPOINT("fsync") || !core::sync_fd(fd_))) {
        healthy_ = false;
        return false;
    }
    current_db_ = db_idx;
    if (is_rewriting_) rewrite_buffer_ += payload;
    return true;
}

bool AofManager::flush_and_fsync() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!is_open_ || !healthy_) return false;
    if (FAILPOINT("fsync") || !core::sync_fd(fd_)) { healthy_ = false; return false; }
    return true;
}

bool AofManager::install_rewrite(const std::string &temporary_path) {
    std::lock_guard<std::mutex> lock(mutex_);
    int replacement = ::open(temporary_path.c_str(), O_WRONLY | O_APPEND | O_CLOEXEC);
    if (replacement < 0) return false;
    const bool written = write_all(replacement, rewrite_buffer_) && core::sync_fd(replacement);
    if (!written || ::rename(temporary_path.c_str(), filepath_.c_str()) != 0) {
        ::close(replacement); return false;
    }
    if (fd_ >= 0) ::close(fd_);
    fd_ = replacement;
    current_db_ = db::Keyspace::NUM_DATABASES;
    rewrite_buffer_.clear(); is_rewriting_ = false; healthy_ = true;
    return core::sync_parent_directory(filepath_);
}

void AofManager::start_rewrite_buffer() {
    std::lock_guard<std::mutex> lock(mutex_);
    is_rewriting_ = true;
    rewrite_buffer_ = current_db_ < db::Keyspace::NUM_DATABASES ? format_resp_cmd({"SELECT", std::to_string(current_db_)}) : "";
}

void AofManager::stop_rewrite_buffer_and_append(std::ofstream &target_out) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!rewrite_buffer_.empty()) {
        target_out.write(rewrite_buffer_.data(), static_cast<std::streamsize>(rewrite_buffer_.size()));
        rewrite_buffer_.clear();
    }
    is_rewriting_ = false;
}

bool AofManager::rewrite(const db::Keyspace &keyspace, const std::string &target_filepath) {
    core::TemporaryFile temporary(target_filepath + ".tmp");
    const auto &tmp_filepath = temporary.path();
    if (tmp_filepath.empty()) return false;
    std::ofstream tmp_out(tmp_filepath, std::ios::binary | std::ios::out);
    if (!tmp_out.is_open()) {
        REDISX_LOG_ERROR("Failed to create AOF rewrite temp file: %s", tmp_filepath.c_str());
        return false;
    }

    start_rewrite_buffer();

    std::uint64_t now_ms = core::get_global_time_provider()->wall_now_ms();

    for (std::size_t db_idx = 0; db_idx < db::Keyspace::NUM_DATABASES; ++db_idx) {
        const auto &dict = keyspace.get_db(db_idx);
        if (dict.empty()) continue;

        std::string select_cmd = format_resp_cmd({"SELECT", std::to_string(db_idx)});
        tmp_out.write(select_cmd.data(), static_cast<std::streamsize>(select_cmd.size()));

        std::uint64_t cursor = 0;
        do {
            cursor = dict.scan(cursor, [&](const db::Entry *entry) {
                if (!entry) return;
                if (entry->expire_at_ms > 0 && entry->expire_at_ms <= now_ms) return;

                const auto &obj = entry->value.object();
                const std::string &key = entry->key;

                switch (obj.type()) {
                case types::ObjectType::String: {
                    std::string cmd = format_resp_cmd({"SET", key, obj.as_string()});
                    tmp_out.write(cmd.data(), static_cast<std::streamsize>(cmd.size()));
                    break;
                }
                case types::ObjectType::List: {
                    auto items = obj.list_range(0, -1);
                    if (!items.empty()) {
                        std::vector<std::string> args = {"RPUSH", key};
                        args.insert(args.end(), items.begin(), items.end());
                        std::string cmd = format_resp_cmd(args);
                        tmp_out.write(cmd.data(), static_cast<std::streamsize>(cmd.size()));
                    }
                    break;
                }
                case types::ObjectType::Set: {
                    auto members = obj.set_members();
                    if (!members.empty()) {
                        std::vector<std::string> args = {"SADD", key};
                        args.insert(args.end(), members.begin(), members.end());
                        std::string cmd = format_resp_cmd(args);
                        tmp_out.write(cmd.data(), static_cast<std::streamsize>(cmd.size()));
                    }
                    break;
                }
                case types::ObjectType::Hash: {
                    auto pairs = obj.hash_getall();
                    if (!pairs.empty()) {
                        std::vector<std::string> args = {"HSET", key};
                        for (const auto &[f, v] : pairs) {
                            args.push_back(f);
                            args.push_back(v);
                        }
                        std::string cmd = format_resp_cmd(args);
                        tmp_out.write(cmd.data(), static_cast<std::streamsize>(cmd.size()));
                    }
                    break;
                }
                case types::ObjectType::ZSet: {
                    auto range = obj.zset_range(0, std::numeric_limits<std::size_t>::max());
                    if (!range.empty()) {
                        std::vector<std::string> args = {"ZADD", key};
                        for (const auto &[m, score] : range) {
                            char buffer[128];
                            const auto result = std::to_chars(buffer, buffer + sizeof(buffer), score, std::chars_format::general, std::numeric_limits<double>::max_digits10);
                            args.emplace_back(buffer, result.ptr);
                            args.push_back(m);
                        }
                        std::string cmd = format_resp_cmd(args);
                        tmp_out.write(cmd.data(), static_cast<std::streamsize>(cmd.size()));
                    }
                    break;
                }
                }

                // Append TTL command if set
                if (entry->expire_at_ms > 0) {
                    std::string pexpire_cmd = format_resp_cmd({"PEXPIREAT", key, std::to_string(entry->expire_at_ms)});
                    tmp_out.write(pexpire_cmd.data(), static_cast<std::streamsize>(pexpire_cmd.size()));
                }
            });
        } while (cursor != 0);
    }

    // Append buffer accumulated during rewrite
    stop_rewrite_buffer_and_append(tmp_out);

    tmp_out.flush();
    if (!tmp_out) return false;
    tmp_out.close();
    if (!core::sync_file(tmp_filepath)) return false;

    close();

    std::error_code ec;
    std::filesystem::rename(tmp_filepath, target_filepath, ec);
    if (ec) {
        REDISX_LOG_ERROR("Failed to rename temp AOF to %s: %s", target_filepath.c_str(), ec.message().c_str());
        return false;
    }

    return core::sync_parent_directory(target_filepath) && open(target_filepath, policy_);
}

} // namespace redisx::persistence
