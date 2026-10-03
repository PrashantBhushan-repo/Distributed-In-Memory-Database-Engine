#include "redisx/commands/list_cmds.h"
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

static void handle_lpush(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        types::Object obj = types::Object::create_list();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            obj.list_push_front(cmd.arg(i));
        }
        size_t len = obj.list_len();
        ks.db_set(db_idx, key, db::Value(std::move(obj)));
        proto::RespWriter::write_integer(out, static_cast<int64_t>(len));
    } else {
        auto &obj = entry->value.object();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            obj.list_push_front(cmd.arg(i));
        }
        proto::RespWriter::write_integer(out, static_cast<int64_t>(obj.list_len()));
    }
}

static void handle_rpush(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        types::Object obj = types::Object::create_list();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            obj.list_push_back(cmd.arg(i));
        }
        size_t len = obj.list_len();
        ks.db_set(db_idx, key, db::Value(std::move(obj)));
        proto::RespWriter::write_integer(out, static_cast<int64_t>(len));
    } else {
        auto &obj = entry->value.object();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            obj.list_push_back(cmd.arg(i));
        }
        proto::RespWriter::write_integer(out, static_cast<int64_t>(obj.list_len()));
    }
}

static void handle_lpop(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    auto &obj = entry->value.object();
    auto val = obj.list_pop_front();
    if (!val) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    if (obj.list_len() == 0) {
        ks.db_delete(db_idx, key);
    }
    proto::RespWriter::write_bulk_string(out, *val);
}

static void handle_rpop(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    auto &obj = entry->value.object();
    auto val = obj.list_pop_back();
    if (!val) {
        proto::RespWriter::write_null_bulk(out);
        return;
    }

    if (obj.list_len() == 0) {
        ks.db_delete(db_idx, key);
    }
    proto::RespWriter::write_bulk_string(out, *val);
}

static void handle_lrange(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    ptrdiff_t start = std::stoll(cmd.arg(2));
    ptrdiff_t stop = std::stoll(cmd.arg(3));

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_array_header(out, 0);
        return;
    }

    auto res = entry->value.object().list_range(start, stop);
    proto::RespWriter::write_array_header(out, res.size());
    for (const auto &item : res) {
        proto::RespWriter::write_bulk_string(out, item);
    }
}

static void handle_llen(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::List, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }
    proto::RespWriter::write_integer(out, static_cast<int64_t>(entry->value.object().list_len()));
}

void register_list_commands(Dispatcher &dispatcher) {
    dispatcher.register_command({"LPUSH", -3, CMD_FLAG_WRITE, handle_lpush});
    dispatcher.register_command({"RPUSH", -3, CMD_FLAG_WRITE, handle_rpush});
    dispatcher.register_command({"LPOP", 2, CMD_FLAG_WRITE, handle_lpop});
    dispatcher.register_command({"RPOP", 2, CMD_FLAG_WRITE, handle_rpop});
    dispatcher.register_command({"LRANGE", 4, CMD_FLAG_READONLY, handle_lrange});
    dispatcher.register_command({"LLEN", 2, CMD_FLAG_READONLY, handle_llen});
}

} // namespace redisx::commands
