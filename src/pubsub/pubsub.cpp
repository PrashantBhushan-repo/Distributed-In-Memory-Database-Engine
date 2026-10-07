#include "redisx/pubsub/pubsub.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>

namespace redisx::pubsub {

static std::size_t get_total_sub_count(
    int fd,
    const std::unordered_map<int, std::unordered_set<std::string>> &client_channels,
    const std::unordered_map<int, std::unordered_set<std::string>> &client_patterns
) {
    std::size_t count = 0;
    auto it1 = client_channels.find(fd);
    if (it1 != client_channels.end()) {
        count += it1->second.size();
    }
    auto it2 = client_patterns.find(fd);
    if (it2 != client_patterns.end()) {
        count += it2->second.size();
    }
    return count;
}

std::size_t PubSubManager::subscribe(std::shared_ptr<net::Connection> conn, const std::string &channel) {
    if (!conn) return 0;
    int fd = conn->fd();
    channels_[channel][fd] = conn;
    client_channels_[fd].insert(channel);

    std::size_t total = get_total_sub_count(fd, client_channels_, client_patterns_);
    proto::RespWriter::write_array_header(conn->out_buffer(), 3);
    proto::RespWriter::write_bulk_string(conn->out_buffer(), "subscribe");
    proto::RespWriter::write_bulk_string(conn->out_buffer(), channel);
    proto::RespWriter::write_integer(conn->out_buffer(), static_cast<std::int64_t>(total));
    conn->flush();
    return total;
}

std::size_t PubSubManager::unsubscribe(std::shared_ptr<net::Connection> conn, const std::string &channel) {
    if (!conn) return 0;
    int fd = conn->fd();
    auto ch_it = channels_.find(channel);
    if (ch_it != channels_.end()) {
        ch_it->second.erase(fd);
        if (ch_it->second.empty()) {
            channels_.erase(ch_it);
        }
    }
    auto client_it = client_channels_.find(fd);
    if (client_it != client_channels_.end()) {
        client_it->second.erase(channel);
        if (client_it->second.empty()) {
            client_channels_.erase(client_it);
        }
    }

    std::size_t total = get_total_sub_count(fd, client_channels_, client_patterns_);
    proto::RespWriter::write_array_header(conn->out_buffer(), 3);
    proto::RespWriter::write_bulk_string(conn->out_buffer(), "unsubscribe");
    proto::RespWriter::write_bulk_string(conn->out_buffer(), channel);
    proto::RespWriter::write_integer(conn->out_buffer(), static_cast<std::int64_t>(total));
    conn->flush();
    return total;
}

void PubSubManager::unsubscribe_all(std::shared_ptr<net::Connection> conn) {
    if (!conn) return;
    int fd = conn->fd();
    auto client_it = client_channels_.find(fd);
    if (client_it != client_channels_.end()) {
        std::vector<std::string> chs(client_it->second.begin(), client_it->second.end());
        for (const auto &ch : chs) {
            unsubscribe(conn, ch);
        }
    }
    auto pat_it = client_patterns_.find(fd);
    if (pat_it != client_patterns_.end()) {
        std::vector<std::string> pats(pat_it->second.begin(), pat_it->second.end());
        for (const auto &pat : pats) {
            punsubscribe(conn, pat);
        }
    }
}

std::size_t PubSubManager::psubscribe(std::shared_ptr<net::Connection> conn, const std::string &pattern) {
    if (!conn) return 0;
    int fd = conn->fd();
    patterns_[pattern][fd] = conn;
    client_patterns_[fd].insert(pattern);

    std::size_t total = get_total_sub_count(fd, client_channels_, client_patterns_);
    proto::RespWriter::write_array_header(conn->out_buffer(), 3);
    proto::RespWriter::write_bulk_string(conn->out_buffer(), "psubscribe");
    proto::RespWriter::write_bulk_string(conn->out_buffer(), pattern);
    proto::RespWriter::write_integer(conn->out_buffer(), static_cast<std::int64_t>(total));
    conn->flush();
    return total;
}

std::size_t PubSubManager::punsubscribe(std::shared_ptr<net::Connection> conn, const std::string &pattern) {
    if (!conn) return 0;
    int fd = conn->fd();
    auto pat_it = patterns_.find(pattern);
    if (pat_it != patterns_.end()) {
        pat_it->second.erase(fd);
        if (pat_it->second.empty()) {
            patterns_.erase(pat_it);
        }
    }
    auto client_it = client_patterns_.find(fd);
    if (client_it != client_patterns_.end()) {
        client_it->second.erase(pattern);
        if (client_it->second.empty()) {
            client_patterns_.erase(client_it);
        }
    }

    std::size_t total = get_total_sub_count(fd, client_channels_, client_patterns_);
    proto::RespWriter::write_array_header(conn->out_buffer(), 3);
    proto::RespWriter::write_bulk_string(conn->out_buffer(), "punsubscribe");
    proto::RespWriter::write_bulk_string(conn->out_buffer(), pattern);
    proto::RespWriter::write_integer(conn->out_buffer(), static_cast<std::int64_t>(total));
    conn->flush();
    return total;
}

void PubSubManager::punsubscribe_all(std::shared_ptr<net::Connection> conn) {
    if (!conn) return;
    int fd = conn->fd();
    auto pat_it = client_patterns_.find(fd);
    if (pat_it != client_patterns_.end()) {
        std::vector<std::string> pats(pat_it->second.begin(), pat_it->second.end());
        for (const auto &pat : pats) {
            punsubscribe(conn, pat);
        }
    }
}

std::size_t PubSubManager::publish(const std::string &channel, const std::string &message) {
    std::size_t receivers = 0;

    // Direct channel subscribers
    auto ch_it = channels_.find(channel);
    if (ch_it != channels_.end()) {
        std::vector<int> dead_fds;
        for (auto &[fd, conn_weak] : ch_it->second) {
            auto conn = conn_weak.lock();
            if (conn && conn->state() != net::ConnectionState::Closed) {
                proto::RespWriter::write_array_header(conn->out_buffer(), 3);
                proto::RespWriter::write_bulk_string(conn->out_buffer(), "message");
                proto::RespWriter::write_bulk_string(conn->out_buffer(), channel);
                proto::RespWriter::write_bulk_string(conn->out_buffer(), message);
                conn->flush();
                receivers++;
            } else {
                dead_fds.push_back(fd);
            }
        }
        for (int fd : dead_fds) {
            ch_it->second.erase(fd);
        }
    }

    // Pattern subscribers
    for (auto &[pattern, fds] : patterns_) {
        if (commands::string_match_glob(pattern, channel)) {
            std::vector<int> dead_fds;
            for (auto &[fd, conn_weak] : fds) {
                auto conn = conn_weak.lock();
                if (conn && conn->state() != net::ConnectionState::Closed) {
                    proto::RespWriter::write_array_header(conn->out_buffer(), 4);
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), "pmessage");
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), pattern);
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), channel);
                    proto::RespWriter::write_bulk_string(conn->out_buffer(), message);
                    conn->flush();
                    receivers++;
                } else {
                    dead_fds.push_back(fd);
                }
            }
            for (int fd : dead_fds) {
                fds.erase(fd);
            }
        }
    }

    return receivers;
}

std::vector<std::string> PubSubManager::pubsub_channels(const std::string &pattern) const {
    std::vector<std::string> res;
    for (const auto &[ch, fds] : channels_) {
        if (!fds.empty()) {
            if (pattern.empty() || commands::string_match_glob(pattern, ch)) {
                res.push_back(ch);
            }
        }
    }
    return res;
}

std::vector<std::pair<std::string, std::size_t>> PubSubManager::pubsub_numsub(const std::vector<std::string> &channels) const {
    std::vector<std::pair<std::string, std::size_t>> res;
    res.reserve(channels.size());
    for (const auto &ch : channels) {
        std::size_t count = 0;
        auto it = channels_.find(ch);
        if (it != channels_.end()) {
            count = it->second.size();
        }
        res.emplace_back(ch, count);
    }
    return res;
}

std::size_t PubSubManager::pubsub_numpat() const {
    std::size_t count = 0;
    for (const auto &[pat, fds] : patterns_) {
        count += fds.size();
    }
    return count;
}

bool PubSubManager::is_subscribed(int fd) const {
    auto it1 = client_channels_.find(fd);
    if (it1 != client_channels_.end() && !it1->second.empty()) return true;
    auto it2 = client_patterns_.find(fd);
    if (it2 != client_patterns_.end() && !it2->second.empty()) return true;
    return false;
}

void PubSubManager::remove_client(int fd) {
    auto it1 = client_channels_.find(fd);
    if (it1 != client_channels_.end()) {
        for (const auto &ch : it1->second) {
            auto ch_it = channels_.find(ch);
            if (ch_it != channels_.end()) {
                ch_it->second.erase(fd);
                if (ch_it->second.empty()) channels_.erase(ch_it);
            }
        }
        client_channels_.erase(it1);
    }

    auto it2 = client_patterns_.find(fd);
    if (it2 != client_patterns_.end()) {
        for (const auto &pat : it2->second) {
            auto pat_it = patterns_.find(pat);
            if (pat_it != patterns_.end()) {
                pat_it->second.erase(fd);
                if (pat_it->second.empty()) patterns_.erase(pat_it);
            }
        }
        client_patterns_.erase(it2);
    }
}

void register_pubsub_commands(commands::Dispatcher &dispatcher, PubSubManager &pubsub_mgr) {
    // PUBLISH channel message
    dispatcher.register_command({"PUBLISH", 3, commands::CMD_FLAG_READONLY, [&pubsub_mgr](
                                                                                  const proto::Command &cmd,
                                                                                  db::Keyspace &,
                                                                                  std::size_t,
                                                                                  core::Buffer &out_buf,
                                                                                  std::size_t &
                                                                              ) {
        std::size_t count = pubsub_mgr.publish(cmd.arg(1), cmd.arg(2));
        proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(count));
    }});

    // PUBSUB subcommand [argument ...]
    dispatcher.register_command({"PUBSUB", -2, commands::CMD_FLAG_READONLY, [&pubsub_mgr](
                                                                                  const proto::Command &cmd,
                                                                                  db::Keyspace &,
                                                                                  std::size_t,
                                                                                  core::Buffer &out_buf,
                                                                                  std::size_t &
                                                                              ) {
        std::string sub = cmd.arg(1);
        std::transform(sub.begin(), sub.end(), sub.begin(), ::toupper);

        if (sub == "CHANNELS") {
            std::string pat = (cmd.arg_count() >= 3) ? cmd.arg(2) : "";
            auto chs = pubsub_mgr.pubsub_channels(pat);
            proto::RespWriter::write_array_header(out_buf, chs.size());
            for (const auto &c : chs) {
                proto::RespWriter::write_bulk_string(out_buf, c);
            }
        } else if (sub == "NUMSUB") {
            std::vector<std::string> chs;
            for (std::size_t i = 2; i < cmd.arg_count(); ++i) {
                chs.push_back(cmd.arg(i));
            }
            auto res = pubsub_mgr.pubsub_numsub(chs);
            proto::RespWriter::write_array_header(out_buf, res.size() * 2);
            for (const auto &[ch, count] : res) {
                proto::RespWriter::write_bulk_string(out_buf, ch);
                proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(count));
            }
        } else if (sub == "NUMPAT") {
            proto::RespWriter::write_integer(out_buf, static_cast<std::int64_t>(pubsub_mgr.pubsub_numpat()));
        } else {
            proto::RespWriter::write_error(out_buf, "ERR Unknown PUBSUB subcommand '" + cmd.arg(1) + "'");
        }
    }});
}

} // namespace redisx::pubsub
