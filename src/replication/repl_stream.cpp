#include "redisx/replication/repl_stream.h"
#include "redisx/core/fault_injection.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"

#include <algorithm>
#include <sstream>

namespace redisx::replication {

static std::string format_resp_array(const std::vector<std::string> &args) {
    std::string out;
    out.reserve(128);
    out += "*" + std::to_string(args.size()) + "\r\n";
    for (const auto &arg : args) {
        out += "$" + std::to_string(arg.size()) + "\r\n" + arg + "\r\n";
    }
    return out;
}

ReplStream::ReplStream(ReplIdManager &replid_mgr, ReplBacklog &backlog)
    : replid_mgr_(replid_mgr), backlog_(backlog) {}

void ReplStream::add_replica(std::shared_ptr<net::Connection> conn, std::uint16_t listening_port) {
    if (!conn) return;
    int fd = conn->fd();
    ReplicaClientInfo info;
    info.conn = conn;
    info.listening_port = listening_port;
    info.ack_offset = 0;
    active_stream_db_ = db::Keyspace::NUM_DATABASES;
    info.last_ack_time_ms = core::monotonic_now_ms();
    info.online = true;
    replicas_[fd] = info;
    REDISX_LOG_INFO("Replica connected on fd %d (port: %u)", fd, listening_port);
}

void ReplStream::remove_replica(int fd) {
    auto it = replicas_.find(fd);
    if (it != replicas_.end()) {
        REDISX_LOG_INFO("Replica disconnected on fd %d", fd);
        replicas_.erase(it);
    }
}

void ReplStream::update_replica_ack(int fd, std::uint64_t ack_offset, std::uint64_t now_ms) {
    auto it = replicas_.find(fd);
    if (it != replicas_.end()) {
        it->second.ack_offset = std::min(ack_offset, replid_mgr_.master_repl_offset());
        it->second.last_ack_time_ms = now_ms;
    }
}

std::size_t ReplStream::count_replicas_at_offset(std::uint64_t target_offset) const {
    std::size_t count = 0;
    for (const auto &[fd, replica] : replicas_) {
        if (replica.online && replica.ack_offset >= target_offset) {
            count++;
        }
    }
    return count;
}

void ReplStream::ensure_db_selected(std::size_t db_idx) {
    if (db_idx != active_stream_db_) {
        std::vector<std::string> select_args = {"SELECT", std::to_string(db_idx)};
        std::string bytes = format_resp_array(select_args);
        backlog_.write(bytes, replid_mgr_);
        send_bytes_to_all(bytes);
        active_stream_db_ = db_idx;
    }
}

void ReplStream::propagate_explicit_del(std::size_t db_idx, const std::string &key) {
    ensure_db_selected(db_idx);
    std::vector<std::string> del_args = {"DEL", key};
    std::string bytes = format_resp_array(del_args);
    backlog_.write(bytes, replid_mgr_);
    send_bytes_to_all(bytes);
}

void ReplStream::propagate_command(
    const proto::Command &cmd,
    db::Keyspace &keyspace,
    std::size_t db_idx
) {
    if (cmd.empty()) return;

    std::string name = cmd.name_upper();
    if (name == "MULTI" && transaction_depth_++ != 0) return;
    if (name == "EXEC") { if (!transaction_depth_ || --transaction_depth_ != 0) return; }

    ensure_db_selected(db_idx);

    (void)keyspace;
    const auto bytes = format_resp_array(cmd.args());
    backlog_.write(bytes, replid_mgr_);
    send_bytes_to_all(bytes);
}

void ReplStream::send_bytes_to_all(const std::string &bytes) {
    if (bytes.empty() || replicas_.empty()) return;
    if (FAILPOINT("replica_send")) {
        REDISX_LOG_WARN("Injected failure at failpoint 'replica_send'");
        return;
    }

    std::vector<int> disconnected_fds;

    for (auto &[fd, replica] : replicas_) {
        if (replica.conn && replica.conn->state() == net::ConnectionState::Connected) {
            replica.conn->send(bytes.data(), bytes.size());
            replica.conn->flush();
        } else {
            disconnected_fds.push_back(fd);
        }
    }

    for (int fd : disconnected_fds) {
        replicas_.erase(fd);
    }
}

} // namespace redisx::replication
