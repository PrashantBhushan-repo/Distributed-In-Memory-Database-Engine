#include "redisx/persistence/aof.h"
#include "redisx/core/fault_injection.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"

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

bool AofManager::open(const std::string &filepath, FsyncPolicy policy) {
    std::lock_guard<std::mutex> lock(mutex_);
    filepath_ = filepath;
    policy_ = policy;
    out_.open(filepath_, std::ios::app | std::ios::binary);
    if (!out_.is_open()) {
        REDISX_LOG_ERROR("Failed to open AOF file: %s", filepath_.c_str());
        return false;
    }
    is_open_ = true;
    return true;
}

void AofManager::close() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (is_open_) {
        out_.flush();
        out_.close();
        is_open_ = false;
    }
}

void AofManager::append_command(std::size_t db_idx, const std::vector<std::string> &args) {
    if (!is_open_ || args.empty()) return;
    if (FAILPOINT("aof_write")) {
        REDISX_LOG_WARN("Injected failure at failpoint 'aof_write'");
        return;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    std::string payload;

    if (db_idx != current_db_) {
        current_db_ = db_idx;
        payload += format_resp_cmd({"SELECT", std::to_string(db_idx)});
    }

    payload += format_resp_cmd(args);
    out_.write(payload.data(), static_cast<std::streamsize>(payload.size()));

    if (is_rewriting_) {
        rewrite_buffer_ += payload;
    }

    if (policy_ == FsyncPolicy::Always) {
        if (!FAILPOINT("fsync")) {
            out_.flush();
        }
    }
}

void AofManager::flush_and_fsync() {
    if (FAILPOINT("fsync")) {
        REDISX_LOG_WARN("Injected failure at failpoint 'fsync'");
        return;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    if (is_open_ && out_.is_open()) {
        out_.flush();
    }
}

void AofManager::start_rewrite_buffer() {
    std::lock_guard<std::mutex> lock(mutex_);
    is_rewriting_ = true;
    rewrite_buffer_.clear();
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
    std::string tmp_filepath = target_filepath + ".tmp";
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
                            args.push_back(std::to_string(score));
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
    tmp_out.close();

    close();

    std::error_code ec;
    std::filesystem::rename(tmp_filepath, target_filepath, ec);
    if (ec) {
        REDISX_LOG_ERROR("Failed to rename temp AOF to %s: %s", target_filepath.c_str(), ec.message().c_str());
        return false;
    }

    return open(target_filepath, policy_);
}

} // namespace redisx::persistence
