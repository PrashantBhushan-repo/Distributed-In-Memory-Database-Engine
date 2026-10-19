#include "redisx/commands/expire_cmds.h"
#include "redisx/proto/resp_writer.h"
#include <charconv>
#include <cctype>
#include <limits>

namespace redisx::commands {
namespace {
void expire_command(const proto::Command &cmd, db::Keyspace &keys, std::size_t db,
                    core::Buffer &out, db::TTLManager &ttl, bool absolute, std::int64_t scale) {
    std::int64_t value = 0;
    const auto &text = cmd.arg(2);
    auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (error != std::errc{} || end != text.data() + text.size() ||
        value > std::numeric_limits<std::int64_t>::max() / scale ||
        value < std::numeric_limits<std::int64_t>::min() / scale) {
        proto::RespWriter::write_error(out, "ERR value is not an integer or out of range"); return;
    }
    bool nx = false, xx = false, gt = false, lt = false;
    for (std::size_t i = 3; i < cmd.arg_count(); ++i) {
        std::string option = cmd.arg(i);
        for (char &c : option) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
        if (option == "NX") nx = true;
        else if (option == "XX") xx = true;
        else if (option == "GT") gt = true;
        else if (option == "LT") lt = true;
        else { proto::RespWriter::write_error(out, "ERR unsupported option " + option); return; }
    }
    if ((nx && (xx || gt || lt)) || (gt && lt)) {
        proto::RespWriter::write_error(out, "ERR NX and XX, GT or LT options at the same time are not compatible"); return;
    }
    const auto now = ttl.time_provider().wall_now_ms();
    const auto delta = value * scale;
    if (!absolute && delta > 0 && static_cast<std::uint64_t>(delta) >
        static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max()) - now) {
        proto::RespWriter::write_error(out, "ERR invalid expire time"); return;
    }
    const std::uint64_t deadline = delta <= 0 ? 0 : absolute ? static_cast<std::uint64_t>(delta) : now + static_cast<std::uint64_t>(delta);
    const auto current_ttl = ttl.get_ttl_ms(keys, db, cmd.arg(1));
    if (current_ttl == -2) { proto::RespWriter::write_integer(out, 0); return; }
    const auto *entry = keys.get_db(db).find(cmd.arg(1));
    const auto existing = entry ? entry->expire_at_ms : 0;
    if ((nx && existing != 0) || (xx && existing == 0) ||
        (gt && (existing == 0 || deadline <= existing)) ||
        (lt && existing != 0 && deadline >= existing)) {
        proto::RespWriter::write_integer(out, 0); return;
    }
    if (deadline <= now) keys.db_delete(db, cmd.arg(1));
    else ttl.set_expire_at(keys, db, cmd.arg(1), deadline);
    proto::RespWriter::write_integer(out, 1);
}
} // namespace
void register_expire_commands(Dispatcher &dispatcher, db::TTLManager &ttl) {
    for (const auto &name : {"EXPIRE", "PEXPIRE", "EXPIREAT", "PEXPIREAT"}) {
        const bool absolute = std::string_view(name).ends_with("AT");
        const std::int64_t scale = name[0] == 'P' ? 1 : 1000;
        dispatcher.register_command({name, -3, CMD_FLAG_WRITE,
            [&ttl, absolute, scale](const proto::Command &cmd, db::Keyspace &keys, std::size_t db, core::Buffer &out, std::size_t &) {
                expire_command(cmd, keys, db, out, ttl, absolute, scale);
            }});
    }
    dispatcher.register_command({"TTL", 2, CMD_FLAG_READONLY,
        [&ttl](const proto::Command &cmd, db::Keyspace &keys, std::size_t db, core::Buffer &out, std::size_t &) {
            proto::RespWriter::write_integer(out, ttl.get_ttl_seconds(keys, db, cmd.arg(1)));
        }});
    dispatcher.register_command({"PTTL", 2, CMD_FLAG_READONLY,
        [&ttl](const proto::Command &cmd, db::Keyspace &keys, std::size_t db, core::Buffer &out, std::size_t &) {
            proto::RespWriter::write_integer(out, ttl.get_ttl_ms(keys, db, cmd.arg(1)));
        }});
    dispatcher.register_command({"PERSIST", 2, CMD_FLAG_WRITE,
        [&ttl](const proto::Command &cmd, db::Keyspace &keys, std::size_t db, core::Buffer &out, std::size_t &) {
            proto::RespWriter::write_integer(out, ttl.remove_expire(keys, db, cmd.arg(1)) ? 1 : 0);
        }});
}
} // namespace redisx::commands
