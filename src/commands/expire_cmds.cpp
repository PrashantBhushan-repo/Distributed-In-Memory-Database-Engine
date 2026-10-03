#include "redisx/commands/expire_cmds.h"
#include "redisx/proto/resp_writer.h"

#include <charconv>
#include <cstdint>
#include <string>
#include <string_view>

namespace redisx::commands {

namespace {

bool parse_int64(std::string_view sv, std::int64_t &out) {
    if (sv.empty()) {
        return false;
    }
    const char *begin = sv.data();
    const char *end = sv.data() + sv.size();
    auto [ptr, ec] = std::from_chars(begin, end, out);
    return (ec == std::errc{} && ptr == end);
}

std::string to_upper(std::string_view sv) {
    std::string s;
    s.reserve(sv.size());
    for (char c : sv) {
        s.push_back(static_cast<char>(std::toupper(static_cast<unsigned char>(c))));
    }
    return s;
}

enum class ExpireOption { None, NX, XX, GT, LT };

bool validate_expire_condition(ExpireOption opt, std::int64_t current_ttl_ms, std::uint64_t new_expire_at_ms,
                               std::uint64_t current_expire_at_ms) {
    switch (opt) {
    case ExpireOption::None:
        return true;
    case ExpireOption::NX:
        return (current_ttl_ms == -1); // Only when key has NO TTL
    case ExpireOption::XX:
        return (current_ttl_ms >= 0);  // Only when key HAS a TTL
    case ExpireOption::GT:
        return (current_ttl_ms >= 0 && new_expire_at_ms > current_expire_at_ms);
    case ExpireOption::LT:
        return (current_ttl_ms < 0 || new_expire_at_ms < current_expire_at_ms);
    }
    return true;
}

} // namespace

void register_expire_commands(Dispatcher &dispatcher, db::TTLManager &ttl_mgr) {
    // ------------------------------------------------------------
    // EXPIRE key seconds [NX|XX|GT|LT]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "EXPIRE",
        -3,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            std::int64_t seconds = 0;
            if (!parse_int64(cmd.arg(2), seconds)) {
                proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range");
                return;
            }

            ExpireOption opt = ExpireOption::None;
            if (cmd.arg_count() >= 4) {
                std::string opt_str = to_upper(cmd.arg(3));
                if (opt_str == "NX") opt = ExpireOption::NX;
                else if (opt_str == "XX") opt = ExpireOption::XX;
                else if (opt_str == "GT") opt = ExpireOption::GT;
                else if (opt_str == "LT") opt = ExpireOption::LT;
                else {
                    proto::RespWriter::write_error(out_buf, "ERR unsupported option");
                    return;
                }
            }

            std::int64_t curr_ttl = ttl_mgr.get_ttl_ms(keyspace, db_idx, key);
            if (curr_ttl == -2) { // Key does not exist
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            std::uint64_t now = ttl_mgr.time_provider().monotonic_now_ms();
            std::uint64_t new_expire_at = (seconds > 0) ? (now + static_cast<std::uint64_t>(seconds) * 1000) : 0;
            
            db::Entry *e = keyspace.db_get(db_idx, key);
            std::uint64_t curr_expire_at = (e != nullptr) ? e->expire_at_ms : 0;

            if (!validate_expire_condition(opt, curr_ttl, new_expire_at, curr_expire_at)) {
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            if (seconds <= 0) {
                keyspace.db_delete(db_idx, key);
                proto::RespWriter::write_integer(out_buf, 1);
                return;
            }

            ttl_mgr.set_expire_at(keyspace, db_idx, key, new_expire_at);
            proto::RespWriter::write_integer(out_buf, 1);
        }
    });

    // ------------------------------------------------------------
    // PEXPIRE key milliseconds [NX|XX|GT|LT]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PEXPIRE",
        -3,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            std::int64_t ms = 0;
            if (!parse_int64(cmd.arg(2), ms)) {
                proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range");
                return;
            }

            ExpireOption opt = ExpireOption::None;
            if (cmd.arg_count() >= 4) {
                std::string opt_str = to_upper(cmd.arg(3));
                if (opt_str == "NX") opt = ExpireOption::NX;
                else if (opt_str == "XX") opt = ExpireOption::XX;
                else if (opt_str == "GT") opt = ExpireOption::GT;
                else if (opt_str == "LT") opt = ExpireOption::LT;
                else {
                    proto::RespWriter::write_error(out_buf, "ERR unsupported option");
                    return;
                }
            }

            std::int64_t curr_ttl = ttl_mgr.get_ttl_ms(keyspace, db_idx, key);
            if (curr_ttl == -2) {
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            std::uint64_t now = ttl_mgr.time_provider().monotonic_now_ms();
            std::uint64_t new_expire_at = (ms > 0) ? (now + static_cast<std::uint64_t>(ms)) : 0;
            
            db::Entry *e = keyspace.db_get(db_idx, key);
            std::uint64_t curr_expire_at = (e != nullptr) ? e->expire_at_ms : 0;

            if (!validate_expire_condition(opt, curr_ttl, new_expire_at, curr_expire_at)) {
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            if (ms <= 0) {
                keyspace.db_delete(db_idx, key);
                proto::RespWriter::write_integer(out_buf, 1);
                return;
            }

            ttl_mgr.set_expire_at(keyspace, db_idx, key, new_expire_at);
            proto::RespWriter::write_integer(out_buf, 1);
        }
    });

    // ------------------------------------------------------------
    // EXPIREAT key timestamp-seconds [NX|XX|GT|LT]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "EXPIREAT",
        -3,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            std::int64_t ts_sec = 0;
            if (!parse_int64(cmd.arg(2), ts_sec)) {
                proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range");
                return;
            }

            std::uint64_t expire_at_ms = static_cast<std::uint64_t>(ts_sec) * 1000;
            std::uint64_t now = ttl_mgr.time_provider().monotonic_now_ms();

            if (expire_at_ms <= now) {
                if (keyspace.db_delete(db_idx, key)) {
                    proto::RespWriter::write_integer(out_buf, 1);
                } else {
                    proto::RespWriter::write_integer(out_buf, 0);
                }
                return;
            }

            if (ttl_mgr.set_expire_at(keyspace, db_idx, key, expire_at_ms)) {
                proto::RespWriter::write_integer(out_buf, 1);
            } else {
                proto::RespWriter::write_integer(out_buf, 0);
            }
        }
    });

    // ------------------------------------------------------------
    // PEXPIREAT key timestamp-milliseconds [NX|XX|GT|LT]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PEXPIREAT",
        -3,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            std::int64_t ts_ms = 0;
            if (!parse_int64(cmd.arg(2), ts_ms)) {
                proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range");
                return;
            }

            std::uint64_t expire_at_ms = static_cast<std::uint64_t>(ts_ms);
            std::uint64_t now = ttl_mgr.time_provider().monotonic_now_ms();

            if (expire_at_ms <= now) {
                if (keyspace.db_delete(db_idx, key)) {
                    proto::RespWriter::write_integer(out_buf, 1);
                } else {
                    proto::RespWriter::write_integer(out_buf, 0);
                }
                return;
            }

            if (ttl_mgr.set_expire_at(keyspace, db_idx, key, expire_at_ms)) {
                proto::RespWriter::write_integer(out_buf, 1);
            } else {
                proto::RespWriter::write_integer(out_buf, 0);
            }
        }
    });

    // ------------------------------------------------------------
    // TTL key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "TTL",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::int64_t ttl_sec = ttl_mgr.get_ttl_seconds(keyspace, db_idx, cmd.arg(1));
            proto::RespWriter::write_integer(out_buf, ttl_sec);
        }
    });

    // ------------------------------------------------------------
    // PTTL key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PTTL",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::int64_t ttl_ms = ttl_mgr.get_ttl_ms(keyspace, db_idx, cmd.arg(1));
            proto::RespWriter::write_integer(out_buf, ttl_ms);
        }
    });

    // ------------------------------------------------------------
    // PERSIST key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PERSIST",
        2,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            if (ttl_mgr.remove_expire(keyspace, db_idx, cmd.arg(1))) {
                proto::RespWriter::write_integer(out_buf, 1);
            } else {
                proto::RespWriter::write_integer(out_buf, 0);
            }
        }
    });
}

} // namespace redisx::commands
