#include "redisx/commands/string_cmds.h"
#include "redisx/proto/resp_writer.h"

#include <charconv>
#include <algorithm>
#include <cstdint>
#include <limits>
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

bool string_match_glob(std::string_view pattern, std::string_view text, bool ignore_case) noexcept {
    std::size_t p = 0, t = 0, star = std::string_view::npos, retry = 0;
    const auto fold = [ignore_case](unsigned char c) { return ignore_case ? std::tolower(c) : static_cast<int>(c); };
    while (t < text.size()) {
        if (p < pattern.size() && pattern[p] == '*') { star = ++p; retry = t; continue; }
        auto next = p;
        bool matched = false;
        if (next < pattern.size()) {
            const auto token = pattern[next++];
            if (token == '?') matched = true;
            else if (token == '[') {
                const bool negate = next < pattern.size() && pattern[next] == '^';
                if (negate) ++next;
                bool any = false;
                while (next < pattern.size() && pattern[next] != ']') {
                    auto first = pattern[next++];
                    if (first == '\\' && next < pattern.size()) first = pattern[next++];
                    if (next + 1 < pattern.size() && pattern[next] == '-' && pattern[next + 1] != ']') {
                        ++next; auto last = pattern[next++];
                        auto low = fold(static_cast<unsigned char>(first)), high = fold(static_cast<unsigned char>(last));
                        if (low > high) std::swap(low, high);
                        const auto c = fold(static_cast<unsigned char>(text[t])); any |= c >= low && c <= high;
                    } else any |= fold(static_cast<unsigned char>(first)) == fold(static_cast<unsigned char>(text[t]));
                }
                if (next < pattern.size() && pattern[next] == ']') ++next;
                matched = negate ? !any : any;
            } else {
                auto literal = token;
                if (literal == '\\' && next < pattern.size()) literal = pattern[next++];
                matched = fold(static_cast<unsigned char>(literal)) == fold(static_cast<unsigned char>(text[t]));
            }
        }
        if (matched) { p = next; ++t; }
        else if (star != std::string_view::npos) { p = star; t = ++retry; }
        else return false;
    }
    while (p < pattern.size() && pattern[p] == '*') ++p;
    return p == pattern.size();
}

void register_string_commands(Dispatcher &dispatcher, db::TTLManager &ttl_mgr, obs::ServerStats *stats) {
    // ------------------------------------------------------------
    // PING
    // ------------------------------------------------------------
    dispatcher.register_command({
        "PING",
        -1,
        CMD_FLAG_READONLY,
        [](const proto::Command &cmd, db::Keyspace &/*keyspace*/, std::size_t /*db_idx*/,
           core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            if (cmd.arg_count() > 2) {
                proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments for 'ping' command");
            } else if (cmd.arg_count() <= 1) {
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
    dispatcher.register_command({"SET", -3, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM,
        [&ttl_mgr](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &) {
            bool nx = false, xx = false, get = false, keep = false, expires = false;
            std::uint64_t deadline = 0;
            const auto now = ttl_mgr.time_provider().wall_now_ms();
            for (std::size_t i = 3; i < cmd.arg_count(); ++i) {
                const auto option = to_upper(cmd.arg(i));
                if (option == "NX") nx = true;
                else if (option == "XX") xx = true;
                else if (option == "GET") get = true;
                else if (option == "KEEPTTL") {
                    if (expires) { proto::RespWriter::write_error(out_buf, "ERR syntax error"); return; }
                    keep = true;
                } else if (option == "EX" || option == "PX" || option == "EXAT" || option == "PXAT") {
                    if (keep || expires || i + 1 >= cmd.arg_count()) {
                        proto::RespWriter::write_error(out_buf, "ERR syntax error"); return;
                    }
                    std::int64_t value = 0;
                    const std::int64_t scale = option.front() == 'E' ? 1000 : 1;
                    if (!parse_int64(cmd.arg(++i), value) || value <= 0 || value > std::numeric_limits<std::int64_t>::max() / scale) {
                        proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command"); return;
                    }
                    deadline = static_cast<std::uint64_t>(value * scale);
                    if (!option.ends_with("AT")) {
                        if (deadline > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max()) - now) {
                            proto::RespWriter::write_error(out_buf, "ERR invalid expire time in 'set' command"); return;
                        }
                        deadline += now;
                    }
                    expires = true;
                } else { proto::RespWriter::write_error(out_buf, "ERR syntax error"); return; }
            }
            if (nx && xx) { proto::RespWriter::write_error(out_buf, "ERR syntax error"); return; }
            const bool expired = ttl_mgr.expire_if_needed(keyspace, db_idx, cmd.arg(1));
            auto *entry = expired ? nullptr : keyspace.db_get(db_idx, cmd.arg(1));
            if (get && entry && !entry->value.is_string()) {
                proto::RespWriter::write_error(out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value"); return;
            }
            const bool exists = entry != nullptr;
            std::optional<std::string> old;
            if (get && entry) old = entry->value.as_string();
            if ((nx && exists) || (xx && !exists)) {
                if (get && old) proto::RespWriter::write_bulk_string(out_buf, *old);
                else proto::RespWriter::write_null_bulk(out_buf);
                return;
            }
            if (keep && entry) deadline = entry->expire_at_ms;
            keyspace.db_set(db_idx, cmd.arg(1), db::Value(cmd.arg(2)), deadline);
            if (get) {
                if (old) proto::RespWriter::write_bulk_string(out_buf, *old);
                else proto::RespWriter::write_null_bulk(out_buf);
            } else proto::RespWriter::write_simple_string(out_buf, "OK");
        }});

    // ------------------------------------------------------------
    // GET key
    // ------------------------------------------------------------
    dispatcher.register_command({
        "GET",
        2,
        CMD_FLAG_READONLY,
        [&ttl_mgr, stats](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            if (ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_null_bulk(out_buf);
                return;
            }

            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_null_bulk(out_buf);
                return;
            }

            if (!e->value.is_string()) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_error(
                    out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                return;
            }

            if (stats) stats->keyspace_hits++;
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
        [&ttl_mgr, stats](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            std::int64_t exist_count = 0;
            for (std::size_t i = 1; i < cmd.arg_count(); ++i) {
                const std::string &key = cmd.arg(i);
                if (!ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                    if (keyspace.db_exists(db_idx, key)) {
                        exist_count++;
                        if (stats) stats->keyspace_hits++;
                    } else {
                        if (stats) stats->keyspace_misses++;
                    }
                } else {
                    if (stats) stats->keyspace_misses++;
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
        [&ttl_mgr, stats](const proto::Command &cmd, db::Keyspace &keyspace, std::size_t db_idx,
                   core::Buffer &out_buf, std::size_t &/*out_db_idx*/) {
            const std::string &key = cmd.arg(1);
            if (ttl_mgr.expire_if_needed(keyspace, db_idx, key)) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            db::Entry *e = keyspace.db_get(db_idx, key);
            if (e == nullptr) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_integer(out_buf, 0);
                return;
            }

            if (!e->value.is_string()) {
                if (stats) stats->keyspace_misses++;
                proto::RespWriter::write_error(
                    out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value");
                return;
            }

            if (stats) stats->keyspace_hits++;
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

            if (val == std::numeric_limits<std::int64_t>::max()) {
                proto::RespWriter::write_error(out_buf, "ERR increment or decrement would overflow");
                return;
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

            if (val == std::numeric_limits<std::int64_t>::min()) {
                proto::RespWriter::write_error(out_buf, "ERR increment or decrement would overflow");
                return;
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

            if ((incr > 0 && val > std::numeric_limits<std::int64_t>::max() - incr) || (incr < 0 && val < std::numeric_limits<std::int64_t>::min() - incr)) {
                proto::RespWriter::write_error(out_buf, "ERR increment or decrement would overflow");
                return;
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
                    if (!parse_int64(cmd.arg(++i), c) || c <= 0) { proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range"); return; }
                    count_hint = static_cast<std::size_t>(c);
                } else { proto::RespWriter::write_error(out_buf, "ERR syntax error"); return; }
            }

            const db::Dict &dict = keyspace.get_db(db_idx);
            std::vector<std::string> keys;

            std::uint64_t next_cursor = cursor;
            std::size_t scans = 0;
            const auto max_scans = count_hint > SIZE_MAX / 10 ? SIZE_MAX : count_hint * 10;
            do {
                ++scans;
                next_cursor = dict.scan(next_cursor, [&](const db::Entry *e) {
                    if (e != nullptr) {
                        if (!ttl_mgr.expire_if_needed(keyspace, db_idx, e->key)) {
                            if (string_match_glob(match_pattern, e->key)) {
                                keys.push_back(e->key);
                            }
                        }
                    }
                });
            } while (next_cursor != 0 && keys.size() < count_hint && scans < max_scans);

            // Output array: [next_cursor_str, [keys...]]
            proto::RespWriter::write_array_header(out_buf, 2);
            proto::RespWriter::write_bulk_string(out_buf, std::to_string(next_cursor));
            proto::RespWriter::write_string_array(out_buf, keys);
        }
    });
}

} // namespace redisx::commands
