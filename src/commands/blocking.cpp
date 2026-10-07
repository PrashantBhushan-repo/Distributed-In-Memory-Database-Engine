#include "redisx/commands/blocking.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/pubsub/keyspace_notify.h"

#include <algorithm>

namespace redisx::commands {

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
        client_info_map_.erase(it);
    }
}

void BlockedClientsManager::drain_ready_keys(
    db::Keyspace &keyspace,
    const Dispatcher &,
    tx::WatchManager *watch_mgr,
    pubsub::PubSubManager *pubsub_mgr
) {
    while (!ready_keys_.empty()) {
        auto pair = ready_keys_.front();
        ready_keys_.erase(ready_keys_.begin());

        std::size_t db_idx = pair.first;
        std::string key = pair.second;

        auto map_it = blocked_map_.find(pair);
        if (map_it == blocked_map_.end() || map_it->second.empty()) {
            continue;
        }

        while (!map_it->second.empty()) {
            auto *entry = keyspace.db_get(db_idx, key);
            if (!entry || entry->value.type() != types::ObjectType::List) {
                break;
            }
            auto &obj = entry->value.object();
            if (obj.list_len() == 0) {
                break;
            }

            auto client_info = map_it->second.front();
            map_it->second.pop_front();

            auto conn = client_info->conn.lock();
            int fd = client_info->fd;

            if (!conn || conn->state() != net::ConnectionState::Connected) {
                remove_client(fd);
                continue;
            }

            std::optional<std::string> popped;
            if (client_info->is_left_pop) {
                popped = obj.list_pop_front();
            } else {
                popped = obj.list_pop_back();
            }

            if (obj.list_len() == 0) {
                keyspace.db_delete(db_idx, key);
            }

            if (watch_mgr) {
                watch_mgr->touch_key(db_idx, key);
            }
            if (pubsub_mgr) {
                pubsub::notify_keyspace_event(*pubsub_mgr, db_idx, client_info->is_left_pop ? "lpop" : "rpop", key, 'l');
            }

            if (popped.has_value()) {
                std::string val = popped.value();

                if (client_info->op_type == BlockingOpType::BLMOVE || client_info->op_type == BlockingOpType::BRPOPLPUSH) {
                    auto *target_entry = keyspace.db_get(db_idx, client_info->target_key);
                    if (!target_entry) {
                        types::Object new_obj = types::Object::create_list();
                        if (client_info->is_left_push) {
                            new_obj.list_push_front(val);
                        } else {
                            new_obj.list_push_back(val);
                        }
                        keyspace.db_set(db_idx, client_info->target_key, db::Value(std::move(new_obj)));
                    } else if (target_entry->value.type() == types::ObjectType::List) {
                        if (client_info->is_left_push) {
                            target_entry->value.object().list_push_front(val);
                        } else {
                            target_entry->value.object().list_push_back(val);
                        }
                    }

                    if (watch_mgr) watch_mgr->touch_key(db_idx, client_info->target_key);
                    if (pubsub_mgr) pubsub::notify_keyspace_event(*pubsub_mgr, db_idx, client_info->is_left_push ? "lpush" : "rpush", client_info->target_key, 'l');

                    signal_ready_key(db_idx, client_info->target_key);

                    proto::RespWriter::write_bulk_string(conn->out_buffer(), val);
                } else {
                    proto::RespWriter::write_array_header(conn->out_buffer(), 2);
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), key);
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), val);
                }
                conn->flush();
            }

            remove_client(fd);
        }

        if (map_it->second.empty()) {
            blocked_map_.erase(map_it);
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
    dispatcher.register_command({"BLPOP", -3, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [&blocked_mgr](
                                                                                     const proto::Command &cmd,
                                                                                     db::Keyspace &keyspace,
                                                                                     std::size_t db_idx,
                                                                                     core::Buffer &out_buf,
                                                                                     std::size_t &
                                                                                 ) {
        double timeout_sec = 0.0;
        try {
            timeout_sec = std::stod(cmd.arg(cmd.arg_count() - 1));
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
    dispatcher.register_command({"BRPOP", -3, CMD_FLAG_WRITE | CMD_FLAG_DENYOOM, [&blocked_mgr](
                                                                                     const proto::Command &cmd,
                                                                                     db::Keyspace &keyspace,
                                                                                     std::size_t db_idx,
                                                                                     core::Buffer &out_buf,
                                                                                     std::size_t &
                                                                                 ) {
        double timeout_sec = 0.0;
        try {
            timeout_sec = std::stod(cmd.arg(cmd.arg_count() - 1));
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
            timeout_sec = std::stod(cmd.arg(5));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        bool left_pop = (wherefrom == "LEFT");
        bool left_push = (whereto == "LEFT");

        auto *entry = keyspace.db_get(db_idx, src);
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
            timeout_sec = std::stod(cmd.arg(3));
            (void)timeout_sec;
        } catch (...) {
            proto::RespWriter::write_error(out_buf, "ERR timeout is not a float or out of range");
            return;
        }

        auto *entry = keyspace.db_get(db_idx, src);
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
