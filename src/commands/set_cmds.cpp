#include "redisx/commands/set_cmds.h"
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

static void handle_sadd(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Set, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    int64_t added = 0;

    if (!entry) {
        types::Object obj = types::Object::create_set();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            if (obj.set_add(cmd.arg(i))) {
                added++;
            }
        }
        ks.db_set(db_idx, key, db::Value(std::move(obj)));
    } else {
        auto &obj = entry->value.object();
        for (size_t i = 2; i < cmd.arg_count(); ++i) {
            if (obj.set_add(cmd.arg(i))) {
                added++;
            }
        }
    }
    proto::RespWriter::write_integer(out, added);
}

static void handle_srem(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Set, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }

    int64_t removed = 0;
    auto &obj = entry->value.object();
    for (size_t i = 2; i < cmd.arg_count(); ++i) {
        if (obj.set_remove(cmd.arg(i))) {
            removed++;
        }
    }

    if (obj.set_len() == 0) {
        ks.db_delete(db_idx, key);
    }
    proto::RespWriter::write_integer(out, removed);
}

static void handle_smembers(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Set, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_array_header(out, 0);
        return;
    }

    auto members = entry->value.object().set_members();
    proto::RespWriter::write_array_header(out, members.size());
    for (const auto &m : members) {
        proto::RespWriter::write_bulk_string(out, m);
    }
}

static void handle_sismember(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    const std::string &member = cmd.arg(2);
    if (!check_type(ks, db_idx, key, types::ObjectType::Set, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }

    bool is_mem = entry->value.object().set_contains(member);
    proto::RespWriter::write_integer(out, is_mem ? 1 : 0);
}

static void handle_scard(const proto::Command &cmd, db::Keyspace &ks, std::size_t db_idx, core::Buffer &out, std::size_t &/*out_db_idx*/) {
    const std::string &key = cmd.arg(1);
    if (!check_type(ks, db_idx, key, types::ObjectType::Set, out)) return;

    auto *entry = ks.db_get(db_idx, key);
    if (!entry) {
        proto::RespWriter::write_integer(out, 0);
        return;
    }
    proto::RespWriter::write_integer(out, static_cast<int64_t>(entry->value.object().set_len()));
}

void register_set_commands(Dispatcher &dispatcher) {
    dispatcher.register_command({"SADD", -3, CMD_FLAG_WRITE, handle_sadd});
    dispatcher.register_command({"SREM", -3, CMD_FLAG_WRITE, handle_srem});
    dispatcher.register_command({"SMEMBERS", 2, CMD_FLAG_READONLY, handle_smembers});
    dispatcher.register_command({"SISMEMBER", 3, CMD_FLAG_READONLY, handle_sismember});
    dispatcher.register_command({"SCARD", 2, CMD_FLAG_READONLY, handle_scard});
}

} // namespace redisx::commands
