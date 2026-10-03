#include "redisx/commands/hash_cmds.h"
#include "redisx/proto/resp_writer.h"

namespace redisx::commands {

static bool check_type(db::Keyspace &ks, std::size_t db_idx, const std::string &key, types::ObjectType expected_type, core::Buffer &out) {
    auto *entry = ks.db_get(db_idx, key);
    if (entry && entry->value.type() != expected_type) {
        proto::RespWriter::write_error(out, "WRONGTYPE Operation against a key holding the wrong kind of value");
        return false;
    }
    return true;
}

static void handle_hset(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    if (cmd.arg_count() < 4 || (cmd.arg_count() % 2) != 0) {
        proto::RespWriter::write_error(out, "ERR wrong number of arguments for 'hset' command");
        return;
    }
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    int64_t new_fields = 0;

    if (!entry) {
        types::Object obj = types::Object::create_hash();
        for (size_t i = 2; i < cmd.arg_count(); i += 2) {
            if (obj.hash_set(cmd.arg(i), cmd.arg(i + 1))) {
                new_fields++;
            }
        }
        ks.db_set(db_idx, key, db::Value(std::move(obj)));
    } else {
        auto &obj = entry->value.object();
        for (size_t i = 2; i < cmd.arg_count(); i += 2) {
            if (obj.hash_set(cmd.arg(i), cmd.arg(i + 1))) {
                new_fields++;
            }
        }
    }
    proto::RespWriter::write_integer(out, new_fields);
}

static void handle_hget(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    const std::string &field = cmd.arg(2);

    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    auto val = entry->value.object().hash_get(field);
    if (val) {
        proto::RespWriter::write_bulk_string(out, *val);
    } else {
        proto::RespWriter::write_null_bulk(out);
    }
}

static void handle_hdel(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }

    int64_t deleted = 0;
    auto &obj = entry->value.object();
    for (size_t i = 2; i < cmd.arg_count(); ++i) {
        if (obj.hash_del(cmd.arg(i))) {
            deleted++;
        }
    }

    if (obj.hash_len() == 0) {
        ks.db_delete(db_idx, key);
    }
    proto::RespWriter::write_integer(out, deleted);
}

static void handle_hgetall(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_array_header(out, 0);
        return;
    }

    auto pairs = entry->value.object().hash_getall();
    proto::RespWriter::write_array_header(out, pairs.size() * 2);
    for (const auto &[f, v] : pairs) {
        proto::RespWriter::write_bulk_string(out, f);
        proto::RespWriter::write_bulk_string(out, v);
    }
}

static void handle_hlen(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }
    proto::RespWriter::write_integer(out, static_cast<int64_t>(entry->value.object().hash_len()));
}

static void handle_hexists(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    const std::string &field = cmd.arg(2);
    if (!check_type(ks, db_idx, key, types::ObjectType::Hash, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }

    auto val = entry->value.object().hash_get(field);
    proto::RespWriter::write_integer(out, val.has_value() ? 1 : 0);
}

void register_hash_commands(Dispatcher &dispatcher) {
    dispatcher.register_command({"HSET", -4, CMD_FLAG_WRITE, handle_hset});
    dispatcher.register_command({"HGET", 3, CMD_FLAG_READONLY, handle_hget});
    dispatcher.register_command({"HDEL", -3, CMD_FLAG_WRITE, handle_hdel});
    dispatcher.register_command({"HGETALL", 2, CMD_FLAG_READONLY, handle_hgetall});
    dispatcher.register_command({"HLEN", 2, CMD_FLAG_READONLY, handle_hlen});
    dispatcher.register_command({"HEXISTS", 3, CMD_FLAG_READONLY, handle_hexists});
}

} // namespace redisx::commands
