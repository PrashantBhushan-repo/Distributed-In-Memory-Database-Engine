#ifndef REDISX_PUBSUB_PUBSUB_H
#define REDISX_PUBSUB_PUBSUB_H

#include "redisx/commands/dispatcher.h"
#include "redisx/net/connection.h"

#include <cstddef>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace redisx::pubsub {

class PubSubManager {
  public:
    PubSubManager() = default;

    // Client subscription operations
    std::size_t subscribe(std::shared_ptr<net::Connection> conn, const std::string &channel);
    std::size_t unsubscribe(std::shared_ptr<net::Connection> conn, const std::string &channel);
    void unsubscribe_all(std::shared_ptr<net::Connection> conn);

    std::size_t psubscribe(std::shared_ptr<net::Connection> conn, const std::string &pattern);
    std::size_t punsubscribe(std::shared_ptr<net::Connection> conn, const std::string &pattern);
    void punsubscribe_all(std::shared_ptr<net::Connection> conn);

    // Publishing
    std::size_t publish(const std::string &channel, const std::string &message);

    // Introspection
    [[nodiscard]] std::vector<std::string> pubsub_channels(const std::string &pattern = "") const;
    [[nodiscard]] std::vector<std::pair<std::string, std::size_t>> pubsub_numsub(const std::vector<std::string> &channels) const;
    [[nodiscard]] std::size_t pubsub_numpat() const;

    [[nodiscard]] bool is_subscribed(int fd) const;
    void remove_client(int fd);

  private:
    std::unordered_map<std::string, std::unordered_map<int, std::weak_ptr<net::Connection>>> channels_;
    std::unordered_map<std::string, std::unordered_map<int, std::weak_ptr<net::Connection>>> patterns_;

    std::unordered_map<int, std::unordered_set<std::string>> client_channels_;
    std::unordered_map<int, std::unordered_set<std::string>> client_patterns_;
};

void register_pubsub_commands(commands::Dispatcher &dispatcher, PubSubManager &pubsub_mgr);

} // namespace redisx::pubsub

#endif // REDISX_PUBSUB_PUBSUB_H
