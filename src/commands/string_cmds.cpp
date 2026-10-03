#include "redisx/commands/string_cmds.h"
#include "redisx/proto/resp_writer.h"

#include <charconv>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

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

bool parse_uint64(std::string_view sv, std::uint64_t &out) {
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

} // namespace

bool string_match_glob(std::string_view pattern, std::string_view string, bool ignore_case) noexcept {
    const char *p = pattern.data();
    const char *p_end = pattern.data() + pattern.size();
    const char *s = string.data();
    const char *s_end = string.data() + string.size();

    while (p < p_end && s < s_end) {
        switch (*p) {
        case '*':
            while (p + 1 < p_end && *(p + 1) == '*') {
                p++;
            }
            if (p + 1 == p_end) {
                return true;
            }
            while (s < s_end) {
                if (string_match_glob({p + 1, static_cast<std::size_t>(p_end - (p + 1))},
                                      {s, static_cast<std::size_t>(s_end - s)}, ignore_case)) {
                    return true;
                }
                s++;
            }
            return false;
        case '?':
            s++;
            p++;
            break;
        case '[': {
            p++;
            bool not_flag = false;
            if (p < p_end && *p == '^') {
                not_flag = true;
                p++;
            }
            bool match = false;
            while (p < p_end && *p != ']') {
                if (p + 2 < p_end && *(p + 1) == '-') {
                    char start = *p;
                    char end = *(p + 2);
                    if (*s >= start && *s <= end) {
                        match = true;
                    }
                    p += 3;
                } else {
                    if (*p == *s) {
                        match = true;
                    }
                    p++;
                }
            }
            if (p < p_end && *p == ']') {
                p++;
            }
            if (not_flag) {
                match = !match;
            }
            if (!match) {
                return false;
            }
            s++;
            break;
        }
        case '\\':
            if (p + 1 < p_end) {
                p++;
            }
            [[fallthrough]];
        default:
            char c1 = *p;
            char c2 = *s;
            if (ignore_case) {
                c1 = static_cast<char>(std::tolower(static_cast<unsigned char>(c1)));
                c2 = static_cast<char>(std::tolower(static_cast<unsigned char>(c2)));
            }
            if (c1 != c2) {
                return false;
            }
            p++;
            s++;
            break;
        }
    }

    while (p < p_end && *p == '*') {
        p++;
    }

    return (p == p_end && s == s_end);
}

void register_string_commands(Dispatcher &dispatcher, db::TTLManager &ttl_mgr) {
    // ------------------------------------------------------------
    // PING
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PING",
        -1,
        CMD_FLAG_READONLY,
        [](const proto::Command &cmd, db::Keyspace &/*keyspace*/, std::size_t /*db_idx*/,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            if (cmd.arg_count() <= 1) {
                proto::RespWriter::write_simple_string(out_buf, "PONG");
            } else {
                proto::RespWriter::write_bulk_string(out_buf, cmd.arg(1));
            }
        }
    });

    // ------------------------------------------------------------
    // ECHO
    // ------------------------------------------------------------
    dispatcher.register_command({
        "ECHO",
        2,
        CMD_FLAG_READONLY,
        [](const proto::Command &cmd, db::Keyspace &/*keyspace*/, std::size_t /*db_idx*/,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            proto::RespWriter::write_bulk_string(out_buf, cmd.arg(1));
        }
    });

    // ------------------------------------------------------------
    // COMMAND
    // ------------------------------------------------------------
    dispatcher.register_command({
        "COMMAND",
        -1,
        CMD_FLAG_READONLY,
        [](const proto::Command &/*cmd*/, db::Keyspace &/*keyspace*/, std::size_t /*db_idx*/,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            proto::RespWriter::write_command_docs(out_buf);
        }
    });

    // ------------------------------------------------------------
    // SELECT
    // ------------------------------------------------------------
    dispatcher.register_command({
        "SELECT",
        2,
        CMD_FLAG_READONLY,
        [](const proto::Command &cmd, db::Keyspace &/*keyspace*/, std::size_t /*db_idx*/,
           core::Buffer &out_buf, std::size_t &out_db_idx) {
            std::int64_t target_db = -1;
            if (!parse_int64(cmd.arg(1), target_db) || target_db < 0 ||
                target_db >= static_cast<std::int64_t>(db::Keyspace::NUM_DATABASES)) {
                proto::RespWriter::write_error(out_buf, "ERR DB index is out of range");
                return;
            }
            out_db_idx = static_cast<std::size_t>(target_db);
            proto::RespWriter::write_simple_string(out_buf, "OK");
        }
    });

    // ------------------------------------------------------------
    // DBSIZE
    // ------------------------------------------------------------
    dispatcher.register_command({
        "DBSIZE",
        1,
        CMD_FLAG_READONLY,
        [](const proto::Command &/*cmd*/, db::Keyspace &keyspace, std::size_t db_idx,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(keyspace.db_size(db_idx)));
        }
    });

    // ------------------------------------------------------------
    // FLUSHDB
    // ------------------------------------------------------------
    dispatcher.register_command({
        "FLUSHDB",
        1,
        CMD_FLAG_WRITE,
        [](const proto::Command &/*cmd*/, db::Keyspace &keyspace, std::size_t db_idx,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            keyspace.flush_db(db_idx);
            proto::RespWriter::write_simple_string(out_buf, "OK");
        }
    });

    // ------------------------------------------------------------
    // SET key value [NX|XX] [GET] [EX s|PX ms|EXAT s|PXAT ms|KEEPTTL]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "SET",
        -3,
        CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            const std::string &val = cmd.arg(2);

            bool nx = false;
            bool xx = false;
            bool get_opt = false;
            bool keepttl = false;
            std::uint64_t expire_at_ms = 0;
            bool set_expire = false;

            std::uint64_t now = ttl_mgr.time_provider().monotonic_now_ms();

            for (std::size_t i = 3; i < cmd.arg_count(); ++i) {
                std::string opt = to_upper(cmd.arg(i));
                if (opt == "NX") {
                    nx = true;
                } else if (opt == "XX") {
                    xx = true;
                } else if (opt == "GET") {
                    get_opt = true;
                } else if (opt == "KEEPTTL") {
                    keepttl = true;
                } else if (opt == "EX" && i + 1 < cmd.arg_count()) {
                    std::int64_t s = 0;
                    if (!parse_int64(cmd.arg(++i), s) || s <= 0) {
                        proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command");
                        return;
                    }
                    expire_at_ms = now + static_cast<std::uint64_t>(s) * 1000;
                    set_expire = true;
                } else if (opt == "PX" && i + 1 < cmd.arg_count()) {
                    std::int64_t ms = 0;
                    if (!parse_int64(cmd.arg(++i), ms) || ms <= 0) {
                        proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command");
                        return;
                    }
                    expire_at_ms = now + static_cast<std::uint64_t>(ms);
                    set_expire = true;
                } else if (opt == "EXAT" && i + 1 < cmd.arg_count()) {
                    std::int64_t ts_s = 0;
                    if (!parse_int64(cmd.arg(++i), ts_s) || ts_s <= 0) {
                        proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command");
                        return;
                    }
                    expire_at_ms = static_cast<std::uint64_t>(ts_s) * 1000;
                    set_expire = true;
                } else if (opt == "PXAT" && i + 1 < cmd.arg_count()) {
                    std::int64_t ts_ms = 0;
                    if (!parse_int64(cmd.arg(++i), ts_ms) || ts_ms <= 0) {
                        proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command");
                        return;
                    }
                    expire_at_ms = static_cast<std::uint64_t>(ts_ms);
                    set_expire = true;
                }
            }

            if (nx && xx) {
                proto::RespWriter::write_error(out_buf, "ERR syntax error");
                return;
            }

            // Lazy expire check first
            ttl_mgr.expire_if_needed(keyspace, db_idx, key);

            bool exists = keyspace.db_exists(db_idx, key);
            if (nx && exists) {
                if (get_opt) {
                    db::Entry *e = keyspace.db_get(db_idx, key);
                    if (e != nullptr && e->value.is_string()) {
                        proto::RespWriter::write_bulk_string(out_buf, e->value.as_string());
                    } else {
                        proto::RespWriter::write_null_bulk(out_buf);
                    }
                } else {
                    proto::RespWriter::write_null_bulk(out_buf);
                }
                return;
            }

            if (xx && !exists) {
                proto::RespWriter::write_null_bulk(out_buf);
                return;
            }

            std::string old_val;
            bool had_old_val = false;
            if (get_opt && exists) {
                db::Entry *e = keyspace.db_get(db_idx, key);
                if (e != nullptr && e->value.is_string()) {
                    old_val = e->value.as_string();
                    had_old_val = true;
                }
            }

            std::uint64_t target_expire = 0;
            if (set_expire) {
                target_expire = expire_at_ms;
            } else if (keepttl && exists) {
                db::Entry *e = keyspace.db_get(db_idx, key);
                if (e != nullptr) {
                    target_expire = e->expire_at_ms;
                }
            } // Else plain SET clears TTL (target_expire = 0)

            keyspace.db_set(db_idx, key, db::Value(val), target_expire);

            if (get_opt) {
                if (had_old_val) {
                    proto::RespWriter::write_bulk_string(out_buf, old_val);
                } else {
                    proto::RespWriter::write_null_bulk(out_buf);
                }
            } else {
                proto::RespWriter::write_simple_string(out_buf, "OK");
            }
        }
    });

    // ------------------------------------------------------------
    // GET key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "GET",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            if (ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                proto::RespWriter::write_null_bulk(out_buf);
                return;
            }

            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                proto::RespWriter::write_null_bulk(out_buf);
                return;
            }

            if (!e->value.is_string()) {
                proto::RespWriter::write_error(
                    out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                return;
            }

            proto::RespWriter::write_bulk_string(out_buf, e->value.as_string());
        }
    });

    // ------------------------------------------------------------
    // DEL key [key ...]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "DEL",
        -2,
        CMD_FLAG_WRITE,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::int64_t deleted_count = 0;
            for (std::size_t i = 1; i < cmd.arg_count(); ++i) {
                const std::string &key = cmd.arg(i);
                ttl_mgr.expire_if_needed(keyspace, db_idx, key);
                if (keyspace.db_delete(db_idx, key)) {
                    deleted_count++;
                }
            }
            proto::RespWriter::write_integer(out_buf, deleted_count);
        }
    });

    // ------------------------------------------------------------
    // EXISTS key [key ...]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "EXISTS",
        -2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::int64_t exist_count = 0;
            for (std::size_t i = 1; i < cmd.arg_count(); ++i) {
                const std::string &key = cmd.arg(i);
                if (!ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                    if (keyspace.db_exists(db_idx, key)) {
                        exist_count++;
                    }
                }
            }
            proto::RespWriter::write_integer(out_buf, exist_count);
        }
    });

    // ------------------------------------------------------------
    // APPEND key value
    // ------------------------------------------------------------
    dispatcher.register_command({
        "APPEND",
        3,
        CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            const std::string &append_val = cmd.arg(2);

            ttl_mgr.expire_if_needed(keyspace, db_idx, key);
            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                keyspace.db_set(db_idx, key, db::Value(append_val));
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(append_val.size()));
                return;
            }

            if (!e->value.is_string()) {
                proto::RespWriter::write_error(
                    out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                return;
            }

            e->value.as_string().append(append_val);
            proto::RespWriter::write_integer(
                out_buf, static_cast<std::int64_t>(e->value.as_string().size()));
        }
    });

    // ------------------------------------------------------------
    // STRLEN key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "STRLEN",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            if (ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            if (!e->value.is_string()) {
                proto::RespWriter::write_error(
                    out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                return;
            }

            proto::RespWriter::write_integer(
                out_buf, static_cast<std::int64_t>(e->value.as_string().size()));
        }
    });

    // ------------------------------------------------------------
    // INCR key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "INCR",
        2,
        CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            ttl_mgr.expire_if_needed(keyspace, db_idx, key);
            db::Entry *e = keyspace.db_get(db_idx, key);

            std::int64_t val = 0;
            std::uint64_t existing_ttl = 0;
            if (e != nullptr) {
                if (!e->value.is_string()) {
                    proto::RespWriter::write_error(
                        out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                    return;
                }
                if (!parse_int64(e->value.as_string(), val)) {
                    proto::RespWriter::write_error(
                        out_buf, "ERR value is not an integer or out of range");
                    return;
                }
                existing_ttl = e->expire_at_ms;
            }

            val++;
            keyspace.db_set(db_idx, key, db::Value(std::to_string(val)), existing_ttl);
            proto::RespWriter::write_integer(out_buf, val);
        }
    });

    // ------------------------------------------------------------
    // DECR key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "DECR",
        2,
        CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            ttl_mgr.expire_if_needed(keyspace, db_idx, key);
            db::Entry *e = keyspace.db_get(db_idx, key);

            std::int64_t val = 0;
            std::uint64_t existing_ttl = 0;
            if (e != nullptr) {
                if (!e->value.is_string()) {
                    proto::RespWriter::write_error(
                        out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                    return;
                }
                if (!parse_int64(e->value.as_string(), val)) {
                    proto::RespWriter::write_error(
                        out_buf, "ERR value is not an integer or out of range");
                    return;
                }
                existing_ttl = e->expire_at_ms;
            }

            val--;
            keyspace.db_set(db_idx, key, db::Value(std::to_string(val)), existing_ttl);
            proto::RespWriter::write_integer(out_buf, val);
        }
    });

    // ------------------------------------------------------------
    // INCRBY key increment
    // ------------------------------------------------------------
    dispatcher.register_command({
        "INCRBY",
        3,
        CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            std::int64_t incr = 0;
            if (!parse_int64(cmd.arg(2), incr)) {
                proto::RespWriter::write_error(
                    out_buf, "ERR value is not an integer or out of range");
                return;
            }

            ttl_mgr.expire_if_needed(keyspace, db_idx, key);
            db::Entry *e = keyspace.db_get(db_idx, key);
            std::int64_t val = 0;
            std::uint64_t existing_ttl = 0;
            if (e != nullptr) {
                if (!e->value.is_string()) {
                    proto::RespWriter::write_error(
                        out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                    return;
                }
                if (!parse_int64(e->value.as_string(), val)) {
                    proto::RespWriter::write_error(
                        out_buf, "ERR value is not an integer or out of range");
                    return;
                }
                existing_ttl = e->expire_at_ms;
            }

            val += incr;
            keyspace.db_set(db_idx, key, db::Value(std::to_string(val)), existing_ttl);
            proto::RespWriter::write_integer(out_buf, val);
        }
    });

    // ------------------------------------------------------------
    // TYPE key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "TYPE",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            if (ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                proto::RespWriter::write_simple_string(out_buf, "none");
                return;
            }

            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                proto::RespWriter::write_simple_string(out_buf, "none");
            } else {
                proto::RespWriter::write_simple_string(out_buf, redisx::types::to_string(e->value.type()));
            }
        }
    });

    // ------------------------------------------------------------
    // KEYS pattern
    // ------------------------------------------------------------
    dispatcher.register_command({
        "KEYS",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::string_view pattern = cmd.arg(1);
            std::vector<std::string> matches;

            const db::Dict &dict = keyspace.get_db(db_idx);
            std::uint64_t cursor = 0;
            do {
                cursor = dict.scan(cursor, [&](const db::Entry *e) {
                    if (e != nullptr) {
                        if (!ttl_mgr.expire_if_needed(keyspace, db_idx, e->key)) {
                            if (string_match_glob(pattern, e->key)) {
                                matches.push_back(e->key);
                            }
                        }
                    }
                });
            } while (cursor != 0);

            proto::RespWriter::write_string_array(out_buf, matches);
        }
    });

    // ------------------------------------------------------------
    // SCAN cursor [MATCH pattern] [COUNT count]
    // ------------------------------------------------------------
    dispatcher.register_command({
        "SCAN",
        -2,
        CMD_FLAG_READONLY,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::uint64_t cursor = 0;
            if (!parse_uint64(cmd.arg(1), cursor)) {
                proto::RespWriter::write_error(out_buf, "ERR invalid cursor");
                return;
            }

            std::string match_pattern = "*";
            std::size_t count_hint = 10;

            for (std::size_t i = 2; i < cmd.arg_count(); ++i) {
                std::string opt = to_upper(cmd.arg(i));
                if (opt == "MATCH" && i + 1 < cmd.arg_count()) {
                    match_pattern = cmd.arg(++i);
                } else if (opt == "COUNT" && i + 1 < cmd.arg_count()) {
                    std::int64_t c = 10;
                    if (parse_int64(cmd.arg(++i), c) && c > 0) {
                        count_hint = static_cast<std::size_t>(c);
                    }
                }
            }

            const db::Dict &dict = keyspace.get_db(db_idx);
            std::vector<std::string> keys;

            std::uint64_t next_cursor = cursor;
            do {
                next_cursor = dict.scan(next_cursor, [&](const db::Entry *e) {
                    if (e != nullptr) {
                        if (!ttl_mgr.expire_if_needed(keyspace, db_idx, e->key)) {
                            if (string_match_glob(match_pattern, e->key)) {
                                keys.push_back(e->key);
                            }
                        }
                    }
                });
            } while (next_cursor != 0 && keys.size() < count_hint);

            // Output array: [next_cursor_str, [keys...]]
            proto::RespWriter::write_array_header(out_buf, 2);
            proto::RespWriter::write_bulk_string(out_buf, std::to_string(next_cursor));
            proto::RespWriter::write_string_array(out_buf, keys);
        }
    });
}

} // namespace redisx::commands
