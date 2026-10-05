#include "redisx/commands/repl_cmds.h"
#include "redisx/core/time.h"
#include "redisx/persistence/snapshot_writer.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <fstream>
#include <sstream>
#include <thread>
#include <chrono>

namespace redisx::commands {

void register_repl_commands(Dispatcher &dispatcher, ReplicationContext &repl_ctx) {
    // REPLICAOF host port / SLAVEOF host port
    auto handle_replicaof = [&repl_ctx](
                                const proto::Command &cmd,
                                db::Keyspace &,
                                std::size_t,
                                core::Buffer &out_buf,
                                std::size_t &
                            ) {
        if (cmd.arg_count() < 3) {
            proto::RespWriter::write_error(out_buf, "ERR wrong number of arguments for 'replicaof' command");
            return;
        }

        std::string host = cmd.arg(1);
        std::string port_str = cmd.arg(2);
        std::transform(host.begin(), host.end(), host.begin(), ::toupper);
        std::transform(port_str.begin(), port_str.end(), port_str.begin(), ::toupper);

        if (host == "NO" && port_str == "ONE") {
            repl_ctx.replica_link.make_master();
            repl_ctx.replid_mgr.shift_replid(replication::ReplIdManager::generate_random_replid());
            proto::RespWriter::write_simple_string(out_buf, "OK");
            return;
        }

        try {
            std::uint16_t port = static_cast<std::uint16_t>(std::stoul(cmd.arg(2)));
            repl_ctx.replica_link.connect(cmd.arg(1), port, repl_ctx.listening_port);
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR invalid port for 'replicaof' command");
        }
    };

    dispatcher.register_command({"REPLICAOF", -3, CMD_FLAG_ADMIN, handle_replicaof});
    dispatcher.register_command({"SLAVEOF", -3, CMD_FLAG_ADMIN, handle_replicaof});

    // PSYNC replid offset
    dispatcher.register_command({"PSYNC", 3, CMD_FLAG_ADMIN, [&repl_ctx](
                                                                  const proto::Command &cmd,
                                                                  db::Keyspace &keyspace,
                                                                  std::size_t,
                                                                  core::Buffer &out_buf,
                                                                  std::size_t &
                                                              ) {
        std::string req_replid = cmd.arg(1);
        std::int64_t req_offset_arg = -1;
        try {
            req_offset_arg = std::stoll(cmd.arg(2));
        } catch (...) {}

        std::uint64_t req_offset = req_offset_arg < 0 ? 0 : static_cast<std::uint64_t>(req_offset_arg);

        if (req_offset_arg >= 0 && repl_ctx.backlog.can_partial_resync(req_replid, req_offset, repl_ctx.replid_mgr)) {
            std::string reply = "+CONTINUE " + repl_ctx.replid_mgr.master_replid() + "\r\n";
            out_buf.append(reply.data(), reply.size());

            std::string backlog_bytes = repl_ctx.backlog.get_bytes_from_offset(req_offset);
            if (!backlog_bytes.empty()) {
                out_buf.append(backlog_bytes.data(), backlog_bytes.size());
            }
        } else {
            std::uint64_t cur_offset = repl_ctx.replid_mgr.master_repl_offset();
            std::string reply = "+FULLRESYNC " + repl_ctx.replid_mgr.master_replid() + " " + std::to_string(cur_offset) + "\r\n";
            out_buf.append(reply.data(), reply.size());

            // Dump snapshot to temp file and stream payload
            std::string snapshot_file = "psync_dump.rdb";
            persistence::SnapshotWriter writer;
            if (writer.write_snapshot(keyspace, snapshot_file)) {
                std::ifstream ifs(snapshot_file, std::ios::binary);
                std::string snapshot_data((std::istreambuf_iterator<char>(ifs)), std::istreambuf_iterator<char>());
                std::string header = "$" + std::to_string(snapshot_data.size()) + "\r\n";
                out_buf.append(header.data(), header.size());
                if (!snapshot_data.empty()) {
                    out_buf.append(snapshot_data.data(), snapshot_data.size());
                }
            } else {
                std::string header = "$0\r\n";
                out_buf.append(header.data(), header.size());
            }
        }
    }});

    // REPLCONF [subcommand ...]
    dispatcher.register_command({"REPLCONF", -2, CMD_FLAG_ADMIN, [&repl_ctx](
                                                                      const proto::Command &cmd,
                                                                      db::Keyspace &,
                                                                      std::size_t,
                                                                      core::Buffer &out_buf,
                                                                      std::size_t &
                                                                  ) {
        if (cmd.arg_count() >= 3) {
            std::string sub = cmd.arg(1);
            std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);
            if (sub == "ACK") {
                try {
                    std::uint64_t ack_offset = std::stoull(cmd.arg(2));
                    (void)ack_offset;
                } catch (...) {}
                return; // Silent response for REPLCONF ACK
            }
        }
        proto::RespWriter::write_simple_string(out_buf, "OK");
    }});

    // WAIT numreplicas timeout_ms
    dispatcher.register_command({"WAIT", 3, CMD_FLAG_READONLY, [&repl_ctx](
                                                                    const proto::Command &cmd,
                                                                    db::Keyspace &,
                                                                    std::size_t,
                                                                    core::Buffer &out_buf,
                                                                    std::size_t &
                                                                ) {
        std::size_t target_replicas = 0;
        std::uint64_t timeout_ms = 0;
        try {
            target_replicas = std::stoul(cmd.arg(1));
            timeout_ms = std::stoull(cmd.arg(2));
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR value is not an integer or out of range");
            return;
        }

        std::uint64_t cur_offset = repl_ctx.replid_mgr.master_repl_offset();
        std::size_t acked = repl_ctx.repl_stream.count_replicas_at_offset(cur_offset);

        // Simple bounded polling for WAIT in synchronous test environments
        std::uint64_t start_ms = core::monotonic_now_ms();
        while (acked < target_replicas && timeout_ms > 0) {
            std::uint64_t elapsed = core::monotonic_now_ms() - start_ms;
            if (elapsed >= timeout_ms) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            acked = repl_ctx.repl_stream.count_replicas_at_offset(cur_offset);
        }

        proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(acked));
    }});

    // INFO [section]
    dispatcher.register_command({"INFO", -1, CMD_FLAG_READONLY, [&repl_ctx](
                                                                     const proto::Command &cmd,
                                                                     db::Keyspace &,
                                                                     std::size_t,
                                                                     core::Buffer &out_buf,
                                                                     std::size_t &
                                                                 ) {
        std::string section = "all";
        if (cmd.arg_count() >= 2) {
            section = cmd.arg(1);
            std::transform(section.begin(), section.end(), section.begin(), ::tolower);
        }

        std::ostringstream ss;
        if (section == "all" || section == "replication") {
            bool is_slave = repl_ctx.replica_link.is_replica_mode();
            ss << "# Replication\r\n";
            ss << "role:" << (is_slave ? "slave" : "master") << "\r\n";

            if (is_slave) {
                ss << "master_host:" << repl_ctx.replica_link.master_host() << "\r\n";
                ss << "master_port:" << repl_ctx.replica_link.master_port() << "\r\n";
                ss << "master_link_status:" << (repl_ctx.replica_link.state() == replication::ReplicaLinkState::Streaming ? "up" : "down") << "\r\n";
                ss << "slave_read_only:1\r\n";
                ss << "slave_repl_offset:" << repl_ctx.replica_link.applied_offset() << "\r\n";
            } else {
                ss << "connected_slaves:" << repl_ctx.repl_stream.replicas().size() << "\r\n";
                std::size_t idx = 0;
                for (const auto &[fd, slave] : repl_ctx.repl_stream.replicas()) {
                    ss << "slave" << idx++ << ":ip=127.0.0.1,port=" << slave.listening_port
                       << ",state=" << (slave.online ? "online" : "offline")
                       << ",offset=" << slave.ack_offset
                       << ",lag=" << (core::monotonic_now_ms() - slave.last_ack_time_ms) / 1000 << "\r\n";
                }
                ss << "master_replid:" << repl_ctx.replid_mgr.master_replid() << "\r\n";
                ss << "master_repl_offset:" << repl_ctx.replid_mgr.master_repl_offset() << "\r\n";
                ss << "second_replid_offset:" << repl_ctx.replid_mgr.second_replid_offset() << "\r\n";
                ss << "repl_backlog_active:1\r\n";
                ss << "repl_backlog_size:" << repl_ctx.backlog.capacity() << "\r\n";
                ss << "repl_backlog_first_byte_offset:" << repl_ctx.backlog.first_byte_offset() << "\r\n";
                ss << "repl_backlog_histlen:" << repl_ctx.backlog.histlen() << "\r\n";
            }
        }

        proto::RespWriter::write_bulk_string(out_buf, ss.str());
    }});

    // ROLE command
    dispatcher.register_command({"ROLE", 1, CMD_FLAG_READONLY, [&repl_ctx](
                                                                    const proto::Command &,
                                                                    db::Keyspace &,
                                                                    std::size_t,
                                                                    core::Buffer &out_buf,
                                                                    std::size_t &
                                                                ) {
        bool is_slave = repl_ctx.replica_link.is_replica_mode();
        if (is_slave) {
            proto::RespWriter::write_array_header(out_buf, 5);
            proto::RespWriter::write_bulk_string(out_buf, "slave");
            proto::RespWriter::write_bulk_string(out_buf, repl_ctx.replica_link.master_host());
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(repl_ctx.replica_link.master_port()));
            std::string status = (repl_ctx.replica_link.state() == replication::ReplicaLinkState::Streaming) ? "connected" : "connecting";
            proto::RespWriter::write_bulk_string(out_buf, status);
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(repl_ctx.replica_link.applied_offset()));
        } else {
            proto::RespWriter::write_array_header(out_buf, 3);
            proto::RespWriter::write_bulk_string(out_buf, "master");
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(repl_ctx.replid_mgr.master_repl_offset()));
            
            const auto &slaves = repl_ctx.repl_stream.replicas();
            proto::RespWriter::write_array_header(out_buf, slaves.size());
            for (const auto &[fd, slave] : slaves) {
                proto::RespWriter::write_array_header(out_buf, 3);
                proto::RespWriter::write_bulk_string(out_buf, "127.0.0.1");
                proto::RespWriter::write_bulk_string(out_buf, std::to_string(slave.listening_port));
                proto::RespWriter::write_bulk_string(out_buf, std::to_string(slave.ack_offset));
            }
        }
    }});
}

} // namespace redisx::commands
