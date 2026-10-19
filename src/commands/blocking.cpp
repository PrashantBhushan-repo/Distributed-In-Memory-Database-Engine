#include "redisx/commands/blocking.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/pubsub/keyspace_notify.h"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <stdexcept>

namespace redisx::commands {
static double parse_timeout(const std::string &value) {
    double result = 0;
    auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), result);
    if (error != std::errc{} || end != value.data() + value.size() || !std::isfinite(result) || result < 0 || result > 9e12)
        throw std::invalid_argument("timeout");
    return result;
}

void BlockedClientsManager::block_client(
    std::shared_ptr<net::Connection> conn,
    std::size_t db_idx,
    std::vector<std::string> keys,
    std::string target_key,
    BlockingOpType op_type,
    bool is_left_pop,
    bool is_left_push,
    double timeout_sec
) {
    if (!conn) return;
    int fd = conn->fd();
    remove_client(fd);
    conn->pause_reading();

    auto info = std::make_shared<BlockedClientInfo>();
    info->fd = fd;
    info->conn = conn;
    info->db_idx = db_idx;
    info->keys = keys;
    info->target_key = std::move(target_key);
    info->op_type = op_type;
    info->is_left_pop = is_left_pop;
    info->is_left_push = is_left_push;

    if (timeout_sec > 0.0) {
        std::uint64_t ms = static_cast<std::uint64_t>(timeout_sec * 1000.0);
        info->timer_id = loop_.add_timer(ms, [this, fd]() {
            auto it = client_info_map_.find(fd);
            if (it != client_info_map_.end()) {
                auto client_info = it->second;
                auto c = client_info->conn.lock();
                if (c && c->state() == net::ConnectionState::Connected) {
                    if (client_info->op_type == BlockingOpType::BLPOP || client_info->op_type == BlockingOpType::BRPOP) {
                        proto::RespWriter::write_null_array(c->out_buffer());
                    } else {
                        proto::RespWriter::write_null_bulk(c->out_buffer());
                    }
                    c->flush();
                }
                remove_client(fd);
            }
        });
    }

    client_info_map_[fd] = info;
    for (const auto &k : keys) {
        blocked_map_[std::make_pair(db_idx, k)].push_back(info);
    }
}

void BlockedClientsManager::signal_ready_key(std::size_t db_idx, const std::string &key) {
    auto pair = std::make_pair(db_idx, key);
    if (std::find(ready_keys_.begin(), ready_keys_.end(), pair) == ready_keys_.end()) {
        ready_keys_.push_back(pair);
    }
}

void BlockedClientsManager::remove_client(int fd) {
    auto it = client_info_map_.find(fd);
    if (it != client_info_map_.end()) {
        auto info = it->second;
        if (info->timer_id != 0) {
            loop_.cancel_timer(info->timer_id);
            info->timer_id = 0;
        }
        for (const auto &k : info->keys) {
            auto pair = std::make_pair(info->db_idx, k);
            auto map_it = blocked_map_.find(pair);
            if (map_it != blocked_map_.end()) {
                map_it->second.remove(info);
                if (map_it->second.empty()) {
                    blocked_map_.erase(map_it);
                }
            }
        }
        auto conn = info->conn.lock();
        client_info_map_.erase(it);
        if (conn) conn->resume_reading();
    }
}

void BlockedClientsManager::drain_ready_keys(db::Keyspace &keyspace, const Dispatcher &dispatcher,
    tx::WatchManager *, pubsub::PubSubManager *) {
    while (!ready_keys_.empty()) {
        auto pair = ready_keys_.front(); ready_keys_.erase(ready_keys_.begin());
        while (true) {
            auto found = blocked_map_.find(pair);
            if (found == blocked_map_.end() || found->second.empty()) break;
            auto info = found->second.front();
            auto conn = info->conn.lock();
            if (!conn || conn->state() != net::ConnectionState::Connected) { remove_client(info->fd); continue; }
            std::vector<std::string> args;
            if (info->op_type == BlockingOpType::BLPOP || info->op_type == BlockingOpType::BRPOP)
                args = {info->is_left_pop ? "BLPOP" : "BRPOP", pair.second, "0"};
            else args = {"BLMOVE", pair.second, info->target_key, info->is_left_pop ? "LEFT" : "RIGHT", info->is_left_push ? "LEFT" : "RIGHT", "0"};
            core::Buffer reply;
            auto selected = info->db_idx;
            dispatcher.dispatch(proto::Command(args), keyspace, info->db_idx, reply, selected);
            if (reply.peek_string_view().starts_with("+PARK_")) break;
            conn->out_buffer().append(reply.peek_string_view());
            conn->flush();
            remove_client(info->fd);
        }
    }
}

void register_blocking_commands(
    Dispatcher &dispatcher,
    BlockedClientsManager &blocked_mgr,
    tx::WatchManager *,
    pubsub::PubSubManager *
) {
    // BLPOP key [key ...] timeout
    dispatcher.register_command({"BLPOP", -3, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [](
                                                                                     const proto::Command &cmd,
                                                                                     db::Keyspace &keyspace,
                                                                                     std::size_t db_idx,
                                                                                     core::Buffer &out_buf,
                                                                                     std::size_t &
                                                                                 ) {
        double timeout_sec = 0.0;
        try {
            timeout_sec = parse_timeout(cmd.arg(cmd.arg_count() - 1));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        std::vector<std::string> keys;
        for (std::size_t i = 1; i < cmd.arg_count() - 1; ++i) {
            keys.push_back(cmd.arg(i));
        }

        // Synchronous check if key has element
        for (const auto &key : keys) {
            auto *entry = keyspace.db_get(db_idx, key);
            if (entry && entry->value.type() != types::ObjectType::List) {
                proto::RespWriter::write_error(out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value"); return;
            }
            if (entry && entry->value.type() == types::ObjectType::List) {
                auto &obj = entry->value.object();
                if (obj.list_len() > 0) {
                    auto popped = obj.list_pop_front();
                    if (obj.list_len() == 0) {
                        keyspace.db_delete(db_idx, key);
                    }
                    if (popped.has_value()) {
                        proto::RespWriter::write_array_header(out_buf, 2);
                        proto::RespWriter::write_bulk_string(out_buf, key);
                        proto::RespWriter::write_bulk_string(out_buf, popped.value());
                        return;
                    }
                }
            }
        }

        // Store marker for main.cpp to park connection if empty
        proto::RespWriter::write_simple_string(out_buf, "PARK_BLPOP");
    }});

    // BRPOP key [key ...] timeout
    dispatcher.register_command({"BRPOP", -3, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [](
                                                                                     const proto::Command &cmd,
                                                                                     db::Keyspace &keyspace,
                                                                                     std::size_t db_idx,
                                                                                     core::Buffer &out_buf,
                                                                                     std::size_t &
                                                                                 ) {
        double timeout_sec = 0.0;
        try {
            timeout_sec = parse_timeout(cmd.arg(cmd.arg_count() - 1));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        std::vector<std::string> keys;
        for (std::size_t i = 1; i < cmd.arg_count() - 1; ++i) {
            keys.push_back(cmd.arg(i));
        }

        // Synchronous check
        for (const auto &key : keys) {
            auto *entry = keyspace.db_get(db_idx, key);
            if (entry && entry->value.type() != types::ObjectType::List) {
                proto::RespWriter::write_error(out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value"); return;
            }
            if (entry && entry->value.type() == types::ObjectType::List) {
                auto &obj = entry->value.object();
                if (obj.list_len() > 0) {
                    auto popped = obj.list_pop_back();
                    if (obj.list_len() == 0) {
                        keyspace.db_delete(db_idx, key);
                    }
                    if (popped.has_value()) {
                        proto::RespWriter::write_array_header(out_buf, 2);
                        proto::RespWriter::write_bulk_string(out_buf, key);
                        proto::RespWriter::write_bulk_string(out_buf, popped.value());
                        return;
                    }
                }
            }
        }

        proto::RespWriter::write_simple_string(out_buf, "PARK_BRPOP");
    }});

    // BLMOVE source destination LEFT|RIGHT LEFT|RIGHT timeout
    dispatcher.register_command({"BLMOVE", 6, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [&blocked_mgr](
                                                                                      const proto::Command &cmd,
                                                                                      db::Keyspace &keyspace,
                                                                                      std::size_t db_idx,
                                                                                      core::Buffer &out_buf,
                                                                                      std::size_t &
                                                                                  ) {
        std::string src = cmd.arg(1);
        std::string dst = cmd.arg(2);
        std::string wherefrom = cmd.arg(3);
        std::string whereto = cmd.arg(4);
        double timeout_sec = 0.0;

        std::transform(wherefrom.begin(), wherefrom.end(), wherefrom.begin(), ::toupper);
        std::transform(whereto.begin(), whereto.end(), whereto.begin(), ::toupper);

        try {
            timeout_sec = parse_timeout(cmd.arg(5));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        if ((wherefrom != "LEFT" && wherefrom != "RIGHT") || (whereto != "LEFT" && whereto != "RIGHT")) {
            proto::RespWriter::write_error(out_buf, "ERR syntax error"); return;
        }
        bool left_pop = (wherefrom == "LEFT");
        bool left_push = (whereto == "LEFT");

        auto *destination = keyspace.db_get(db_idx, dst);
        auto *entry = keyspace.db_get(db_idx, src);
        if ((destination && destination->value.type() != types::ObjectType::List) || (entry && entry->value.type() != types::ObjectType::List)) {
            proto::RespWriter::write_error(out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value"); return;
        }
        if (entry && entry->value.type() == types::ObjectType::List) {
            auto &obj = entry->value.object();
            if (obj.list_len() > 0) {
                auto popped = left_pop ? obj.list_pop_front() : obj.list_pop_back();
                if (obj.list_len() == 0) {
                    keyspace.db_delete(db_idx, src);
                }
                if (popped.has_value()) {
                    std::string val = popped.value();
                    auto *dst_entry = keyspace.db_get(db_idx, dst);
                    if (!dst_entry) {
                        types::Object new_obj = types::Object::create_list();
                        if (left_push) new_obj.list_push_front(val);
                        else new_obj.list_push_back(val);
                        keyspace.db_set(db_idx, dst, db::Value(std::move(new_obj)));
                    } else if (dst_entry->value.type() == types::ObjectType::List) {
                        if (left_push) dst_entry->value.object().list_push_front(val);
                        else dst_entry->value.object().list_push_back(val);
                    }
                    blocked_mgr.signal_ready_key(db_idx, dst);
                    proto::RespWriter::write_bulk_string(out_buf, val);
                    return;
                }
            }
        }

        proto::RespWriter::write_simple_string(out_buf, "PARK_BLMOVE");
    }});

    // BRPOPLPUSH source destination timeout
    dispatcher.register_command({"BRPOPLPUSH", 4, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [&blocked_mgr](
                                                                                           const proto::Command &cmd,
                                                                                           db::Keyspace &keyspace,
                                                                                           std::size_t db_idx,
                                                                                           core::Buffer &out_buf,
                                                                                           std::size_t &
                                                                                       ) {
        std::string src = cmd.arg(1);
        std::string dst = cmd.arg(2);
        double timeout_sec = 0.0;
        try {
            timeout_sec = parse_timeout(cmd.arg(3));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        auto *destination = keyspace.db_get(db_idx, dst);
        auto *entry = keyspace.db_get(db_idx, src);
        if ((destination && destination->value.type() != types::ObjectType::List) || (entry && entry->value.type() != types::ObjectType::List)) {
            proto::RespWriter::write_error(out_buf, "WRONGTYPE Operation against a key holding the wrong kind of value"); return;
        }
        if (entry && entry->value.type() == types::ObjectType::List) {
            auto &obj = entry->value.object();
            if (obj.list_len() > 0) {
                auto popped = obj.list_pop_back();
                if (obj.list_len() == 0) {
                    keyspace.db_delete(db_idx, src);
                }
                if (popped.has_value()) {
                    std::string val = popped.value();
                    auto *dst_entry = keyspace.db_get(db_idx, dst);
                    if (!dst_entry) {
                        types::Object new_obj = types::Object::create_list();
                        new_obj.list_push_front(val);
                        keyspace.db_set(db_idx, dst, db::Value(std::move(new_obj)));
                    } else if (dst_entry->value.type() == types::ObjectType::List) {
                        dst_entry->value.object().list_push_front(val);
                    }
                    blocked_mgr.signal_ready_key(db_idx, dst);
                    proto::RespWriter::write_bulk_string(out_buf, val);
                    return;
                }
            }
        }

        proto::RespWriter::write_simple_string(out_buf, "PARK_BRPOPLPUSH");
    }});
}

} // namespace redisx::commands
