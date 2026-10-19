#include "redisx/commands/persist_cmds.h"
#include "redisx/persistence/service.h"
#include "redisx/proto/resp_writer.h"
namespace redisx::commands {
void register_persist_commands(Dispatcher &dispatcher, persistence::PersistenceService *service) {
    dispatcher.register_command({"SAVE", 1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [service](const proto::Command &, db::Keyspace &keys, std::size_t, core::Buffer &out, std::size_t &) {
            if (service && service->save(keys)) proto::RespWriter::write_simple_string(out, "OK");
            else proto::RespWriter::write_error(out, "ERR Could not save snapshot or a background save is in progress");
        }});
    dispatcher.register_command({"BGSAVE", 1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [service](const proto::Command &, db::Keyspace &keys, std::size_t, core::Buffer &out, std::size_t &) {
            if (service && service->background_save(keys)) proto::RespWriter::write_simple_string(out, "Background saving started");
            else proto::RespWriter::write_error(out, "ERR Could not start background save");
        }});
    dispatcher.register_command({"BGREWRITEAOF", 1, CMD_FLAG_ADMIN | CMD_FLAG_READONLY,
        [service](const proto::Command &, db::Keyspace &keys, std::size_t, core::Buffer &out, std::size_t &) {
            if (service && service->background_rewrite(keys)) proto::RespWriter::write_simple_string(out, "Background append only file rewriting started");
            else proto::RespWriter::write_error(out, "ERR AOF is disabled, unhealthy, or a rewrite is already in progress");
        }});
    dispatcher.register_command({"LASTSAVE", 1, CMD_FLAG_READONLY,
        [service](const proto::Command &, db::Keyspace &, std::size_t, core::Buffer &out, std::size_t &) {
            proto::RespWriter::write_integer(out, service ? static_cast<std::int64_t>(service->last_save_time()) : 0);
        }});
}
}
