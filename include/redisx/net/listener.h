#ifndef REDISX_NET_LISTENER_H
#define REDISX_NET_LISTENER_H

#include "redisx/core/errors.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>

namespace redisx::net {

class Listener {
  public:
    using NewConnectionCallback = std::function<void(std::shared_ptr<Connection>)>;

    static constexpr size_t DEFAULT_MAX_ACCEPTS_PER_TICK = 128;

    Listener(EventLoop &loop, std::string host, std::uint16_t port, size_t max_clients = 10000);
    ~Listener();

    Listener(const Listener &) = delete;
    Listener &operator=(const Listener &) = delete;

    core::Result<void> start();
    void stop();

    void set_new_connection_callback(NewConnectionCallback cb) {
        on_new_connection_ = std::move(cb);
    }

    [[nodiscard]] size_t active_clients_count() const noexcept {
        return connections_.size();
    }

    [[nodiscard]] size_t max_clients() const noexcept {
        return max_clients_;
    }

    void set_max_clients(size_t max_clients) noexcept {
        max_clients_ = max_clients;
    }

  private:
    void handle_accept();
    void remove_connection(const std::shared_ptr<Connection> &conn);

    EventLoop &loop_;
    std::string host_;
    std::uint16_t port_;
    size_t max_clients_;
    int listen_fd_{-1};

    NewConnectionCallback on_new_connection_;
    std::unordered_map<int, std::shared_ptr<Connection>> connections_;
};

} // namespace redisx::net

#endif // REDISX_NET_LISTENER_H
