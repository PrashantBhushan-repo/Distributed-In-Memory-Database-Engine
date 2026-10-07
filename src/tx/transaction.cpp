#include "redisx/tx/transaction.h"
#include "redisx/proto/resp_writer.h"

namespace redisx::tx {

void register_tx_commands(commands::Dispatcher &dispatcher, WatchManager &watch_mgr) {
    // WATCH key [key ...]
    dispatcher.register_command({"WATCH", -2, commands::CMD_FLAG_READONLY, [&watch_mgr](
                                                                                 const proto::Command &cmd,
                                                                                 db::Keyspace &,
                                                                                 std::size_t db_idx,
                                                                                 core::Buffer &out_buf,
                                                                                 std::size_t &
                                                                             ) {
        (void)cmd;
        // Handled in main.cpp connection context or placeholder response
        (void)db_idx;
        (void)watch_mgr;
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});

    // UNWATCH
    dispatcher.register_command({"UNWATCH", 1, commands::CMD_FLAG_READONLY, [&watch_mgr](
                                                                                   const proto::Command &cmd,
                                                                                   db::Keyspace &,
                                                                                   std::size_t,
                                                                                   core::Buffer &out_buf,
                                                                                   std::size_t &
                                                                               ) {
        (void)cmd;
        (void)watch_mgr;
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});

    // MULTI
    dispatcher.register_command({"MULTI", 1, commands::CMD_FLAG_READONLY, [](
                                                                               const proto::Command &,
                                                                               db::Keyspace &,
                                                                               std::size_t,
                                                                               core::Buffer &out_buf,
                                                                               std::size_t &
                                                                           ) {
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});

    // DISCARD
    dispatcher.register_command({"DISCARD", 1, commands::CMD_FLAG_READONLY, [](
                                                                                 const proto::Command &,
                                                                                 db::Keyspace &,
                                                                                 std::size_t,
                                                                                 core::Buffer &out_buf,
                                                                                 std::size_t &
                                                                             ) {
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});

    // EXEC
    dispatcher.register_command({"EXEC", 1, commands::CMD_FLAG_READONLY, [](
                                                                              const proto::Command &,
                                                                              db::Keyspace &,
                                                                              std::size_t,
                                                                              core::Buffer &out_buf,
                                                                              std::size_t &
                                                                          ) {
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});
}

} // namespace redisx::tx
