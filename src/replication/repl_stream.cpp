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
    info.ack_offset = replid_mgr_.master_repl_offset();
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
        it->second.ack_offset = ack_offset;
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

    ensure_db_selected(db_idx);

    std::vector<std::string> rewritten_args;

    if (name == "EXPIRE" || name == "PEXPIRE" || name == "EXPIREAT" || name == "PEXPIREAT" || name == "SETEX") {
        if (name == "SETEX" && cmd.arg_count() >= 4) {
            std::string key = cmd.arg(1);
            std::string val = cmd.arg(3);
            std::uint64_t ttl_sec = std::stoull(cmd.arg(2));
            std::uint64_t expire_at_ms = core::monotonic_now_ms() + ttl_sec * 1000;

            std::string set_bytes = format_resp_array({"SET", key, val});
            backlog_.write(set_bytes, replid_mgr_);
            send_bytes_to_all(set_bytes);

            rewritten_args = std::vector<std::string>{"PEXPIREAT", key, std::to_string(expire_at_ms)};
        } else if (cmd.arg_count() >= 3) {
            std::string key = cmd.arg(1);
            std::int64_t val = std::stoll(cmd.arg(2));
            std::uint64_t expire_at_ms = 0;
            std::uint64_t now_ms = core::monotonic_now_ms();

            if (name == "EXPIRE") expire_at_ms = now_ms + static_cast<std::uint64_t>(val) * 1000;
            else if (name == "PEXPIRE") expire_at_ms = now_ms + static_cast<std::uint64_t>(val);
            else if (name == "EXPIREAT") expire_at_ms = static_cast<std::uint64_t>(val) * 1000;
            else expire_at_ms = static_cast<std::uint64_t>(val);

            rewritten_args = std::vector<std::string>{"PEXPIREAT", key, std::to_string(expire_at_ms)};
        }
    } else if (name == "INCRBYFLOAT" && cmd.arg_count() >= 3) {
        std::string key = cmd.arg(1);
        auto entry = keyspace.db_get(db_idx, key);
        if (entry && entry->value.is_string()) {
            rewritten_args = std::vector<std::string>{"SET", key, entry->value.as_string()};
        } else {
            rewritten_args = cmd.args();
        }
    } else {
        rewritten_args = cmd.args();
    }

    if (!rewritten_args.empty()) {
        std::string bytes = format_resp_array(rewritten_args);
        backlog_.write(bytes, replid_mgr_);
        send_bytes_to_all(bytes);
    }
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
