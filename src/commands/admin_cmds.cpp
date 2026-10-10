#include "redisx/commands/admin_cmds.h"
#include "redisx/core/fault_injection.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <sstream>

namespace redisx::commands {

void register_admin_commands(
    Dispatcher &dispatcher,
    std::unordered_map<int, std::shared_ptr<net::Connection>> &active_clients
) {
    // CLIENT LIST/KILL/INFO/SETNAME/GETNAME
    dispatcher.register_command({"CLIENT", -2, CMD_FLAG_ADMIN, [&active_clients](
                                                                    const proto::Command &cmd,
                                                                    db::Keyspace &,
                                                                    std::size_t,
                                                                    core::Buffer &out_buf,
                                                                    std::size_t &
                                                                ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "LIST") {
            std::ostringstream ss;
            for (const auto &[fd, conn] : active_clients) {
                ss << "id=" << fd << " addr=127.0.0.1:" << (60000 + fd) << " fd=" << fd << " name= db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0 obl=0 oll=0 omem=0 events=r cmd=client\n";
            }
            proto::RespWriter::write_bulk_string(out_buf, ss.str());
        } else if (sub == "KILL" && cmd.arg_count() >= 3) {
            try {
                int target_fd = std::stoi(cmd.arg(2));
                auto it = active_clients.find(target_fd);
                if (it != active_clients.end() && it->second) {
                    it->second->close();
                    proto::RespWriter::write_integer(out_buf, 1);
                } else {
                    proto::RespWriter::write_integer(out_buf, 0);
                }
            } catch (...) {
                proto::RespWriter::write_integer(out_buf, 0);
            }
        } else if (sub == "INFO") {
            proto::RespWriter::write_bulk_string(out_buf, "id=1 addr=127.0.0.1 fd=1 name= db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0 obl=0 oll=0 omem=0 events=r cmd=client\n");
        } else if (sub == "SETNAME" && cmd.arg_count() >= 3) {
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else if (sub == "GETNAME") {
            proto::RespWriter::write_null_bulk(out_buf);
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown CLIENT subcommand '" + cmd.arg(1) + "'");
        }
    }});

    // HELLO [protover [AUTH username password] [SETNAME name]]
    dispatcher.register_command({"HELLO", -1, CMD_FLAG_READONLY, [](
                                                                      const proto::Command &,
                                                                      db::Keyspace &,
                                                                      std::size_t,
                                                                      core::Buffer &out_buf,
                                                                      std::size_t &
                                                                  ) {
        proto::RespWriter::write_array_header(out_buf, 14);
        proto::RespWriter::write_bulk_string(out_buf, "server");
        proto::RespWriter::write_bulk_string(out_buf, "redisx");
        proto::RespWriter::write_bulk_string(out_buf, "version");
        proto::RespWriter::write_bulk_string(out_buf, "0.1.0");
        proto::RespWriter::write_bulk_string(out_buf, "proto");
        proto::RespWriter::write_integer(out_buf, 2);
        proto::RespWriter::write_bulk_string(out_buf, "id");
        proto::RespWriter::write_integer(out_buf, 1);
        proto::RespWriter::write_bulk_string(out_buf, "mode");
        proto::RespWriter::write_bulk_string(out_buf, "standalone");
        proto::RespWriter::write_bulk_string(out_buf, "role");
        proto::RespWriter::write_bulk_string(out_buf, "master");
        proto::RespWriter::write_bulk_string(out_buf, "modules");
        proto::RespWriter::write_array_header(out_buf, 0);
    }});

    // COMMAND / COMMAND DOCS
    dispatcher.register_command({"COMMAND", -1, CMD_FLAG_READONLY, [](
                                                                        const proto::Command &cmd,
                                                                        db::Keyspace &,
                                                                        std::size_t,
                                                                        core::Buffer &out_buf,
                                                                        std::size_t &
                                                                    ) {
        if (cmd.arg_count() >= 2) {
            std::string sub = cmd.arg(1);
            std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
            if (sub == "DOCS") {
                proto::RespWriter::write_command_docs(out_buf);
                return;
            }
        }
        proto::RespWriter::write_array_header(out_buf, 0);
    }});

    // DEBUG [subcommand ...]
    dispatcher.register_command({"DEBUG", -2, CMD_FLAG_ADMIN, [](
                                                                    const proto::Command &cmd,
                                                                    db::Keyspace &,
                                                                    std::size_t,
                                                                    core::Buffer &out_buf,
                                                                    std::size_t &
                                                                ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
        if (sub == "FAILPOINT" && cmd.arg_count() >= 4) {
            std::string name = cmd.arg(2);
            std::transform(name.begin(), name.end(), name.begin(), ::tolower);
            std::string mode_str = cmd.arg(3);
            std::transform(mode_str.begin(), mode_str.end(), mode_str.begin(), ::tolower);

            core::FailpointMode mode = core::FailpointMode::Off;
            double prob = 1.0;
            if (mode_str == "once") {
                mode = core::FailpointMode::Once;
            } else if (mode_str == "always") {
                mode = core::FailpointMode::Always;
            } else if (mode_str == "off") {
                mode = core::FailpointMode::Off;
            } else if (mode_str == "prob" || mode_str == "probabilistic") {
                mode = core::FailpointMode::Probabilistic;
                if (cmd.arg_count() >= 5) {
                    try { prob = std::stod(cmd.arg(4)); } catch (...) { prob = 0.5; }
                } else {
                    prob = 0.5;
                }
            }
            core::FaultInjection::instance().set_failpoint(name, mode, prob);
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else if (sub == "FAILPOINT-RESET") {
            core::FaultInjection::instance().reset();
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else if (sub == "OBJECT" && cmd.arg_count() >= 3) {
            proto::RespWriter::write_simple_string(out_buf, "Value at:0x123456 refcount:1 encoding:embstr serializedlength:10 lru:1000 lru_seconds_idle:0");
        } else {
            proto::RespWriter::write_simple_string(out_buf, "OK");
        }
    }});
}

} // namespace redisx::commands
