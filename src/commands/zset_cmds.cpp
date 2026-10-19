#include "redisx/commands/zset_cmds.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/commands/numeric.h"

#include <charconv>
#include <cmath>
#include <limits>
#include <algorithm>

namespace redisx::commands {
static std::string score_text(double score) {
    char buffer[64];
    const auto [end, error] = std::to_chars(buffer, buffer + sizeof(buffer), score, std::chars_format::general, std::numeric_limits<double>::max_digits10);
    if (error != std::errc{}) throw std::out_of_range("score");
    return std::string(buffer, end);
}


static bool check_type(db::Keyspace &ks, std::size_t db_idx, const std::string &key, types::ObjectType expected_type, core::Buffer &out) {
    auto *entry = ks.db_get(db_idx, key);
    if (entry && entry->value.type() != expected_type) {
        proto::RespWriter::write_error(out, "WRONGTYPE Operation against a key holding the wrong kind of value");
        return false;
    }
    return true;
}

static void handle_zadd(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    if (cmd.arg_count() < 4 || (cmd.arg_count() % 2) != 0) {
        proto::RespWriter::write_error(out, "ERR wrong number of arguments for 'zadd' command");
        return;
    }
    std::vector<double> scores;
    for (std::size_t i = 2; i < cmd.arg_count(); i += 2) {
        std::string_view text = cmd.arg(i);
        if (!text.empty() && text.front() == '+') text.remove_prefix(1);
        double score = 0;
        auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), score);
        if (text.empty() || error != std::errc{} || end != text.data() + text.size() || std::isnan(score)) {
            proto::RespWriter::write_error(out, "ERR value is not a valid float");
            return;
        }
        scores.push_back(score);
    }
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    int64_t added = 0;

    if (!entry) {
        types::Object obj = types::Object::create_zset();
        for (size_t i = 2; i < cmd.arg_count(); i += 2) {
            double score = scores[(i - 2) / 2];
            if (obj.zset_add(score, cmd.arg(i + 1))) {
                added++;
            }
        }
        ks.db_set(db_idx, key, db::Value(std::move(obj)));
    } else {
        auto &obj = entry->value.object();
        for (size_t i = 2; i < cmd.arg_count(); i += 2) {
            double score = scores[(i - 2) / 2];
            if (obj.zset_add(score, cmd.arg(i + 1))) {
                added++;
            }
        }
    }
    proto::RespWriter::write_integer(out, added);
}

static void handle_zscore(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    const std::string &member = cmd.arg(2);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    auto sc = entry->value.object().zset_score(member);
    if (sc) {
        std::string sc_str = score_text(*sc);
        proto::RespWriter::write_bulk_string(out, sc_str);
    } else {
        proto::RespWriter::write_null_bulk(out);
    }
}

static void handle_zrange(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto start = parse_integer(cmd.arg(2));
    auto stop = parse_integer(cmd.arg(3));

    bool withscores = false;
    if (cmd.arg_count() > 5) { proto::RespWriter::write_error(out, "ERR syntax error"); return; }
    if (cmd.arg_count() > 4) {
        std::string opt = cmd.arg(4);
        for (auto &c : opt) c = static_cast<char>(toupper(c));
        if (opt == "WITHSCORES") {
            withscores = true;
        } else { proto::RespWriter::write_error(out, "ERR syntax error"); return; }
    }

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_array_header(out, 0);
        return;
    }

    const auto length = static_cast<std::int64_t>(entry->value.object().zset_len());
    if (start < 0) start += length;
    if (stop < 0) stop += length;
    start = std::max<std::int64_t>(0, start);
    if (stop < 0 || start >= length || start > stop) { proto::RespWriter::write_array_header(out, 0); return; }
    auto range = entry->value.object().zset_range(static_cast<size_t>(start), static_cast<size_t>(stop));
    if (!withscores) {
        proto::RespWriter::write_array_header(out, range.size());
        for (const auto &[m, s] : range) {
            proto::RespWriter::write_bulk_string(out, m);
        }
    } else {
        proto::RespWriter::write_array_header(out, range.size() * 2);
        for (const auto &[m, s] : range) {
            proto::RespWriter::write_bulk_string(out, m);
            std::string sc_str = score_text(s);
            proto::RespWriter::write_bulk_string(out, sc_str);
        }
    }
}

static void handle_zrank(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    const std::string &member = cmd.arg(2);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    auto rk = entry->value.object().zset_rank(member);
    if (rk) {
        proto::RespWriter::write_integer(out, static_cast<int64_t>(*rk));
    } else {
        proto::RespWriter::write_null_bulk(out);
    }
}

static void handle_zrem(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }

    int64_t removed = 0;
    auto &obj = entry->value.object();
    for (size_t i = 2; i < cmd.arg_count(); ++i) {
        if (obj.zset_remove(cmd.arg(i))) {
            removed++;
        }
    }

    if (obj.zset_len() == 0) {
        ks.db_delete(db_idx, key);
    }
    proto::RespWriter::write_integer(out, removed);
}

static void handle_zcard(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::ZSet, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }
    proto::RespWriter::write_integer(out, static_cast<int64_t>(entry->value.object().zset_len()));
}

void register_zset_commands(Dispatcher &dispatcher) {
    dispatcher.register_command({"ZADD", -4, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, handle_zadd});
    dispatcher.register_command({"ZSCORE", 3, CMD_FLAG_READONLY, handle_zscore});
    dispatcher.register_command({"ZRANGE", -4, CMD_FLAG_READONLY, handle_zrange});
    dispatcher.register_command({"ZRANK", 3, CMD_FLAG_READONLY, handle_zrank});
    dispatcher.register_command({"ZREM", -3, CMD_FLAG_WRITE, handle_zrem});
    dispatcher.register_command({"ZCARD", 2, CMD_FLAG_READONLY, handle_zcard});
}

} // namespace redisx::commands
