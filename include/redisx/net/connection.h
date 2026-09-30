#ifndef REDISX_NET_CONNECTION_H
#define REDISX_NET_CONNECTION_H

#include "redisx/core/buffer.h"
#include "redisx/core/errors.h"
#include "redisx/net/event_loop.h"

#include <functional>
#include <memory>
#include <string_view>

namespace redisx::net {

enum class ConnectionState { Connected, Reading, Writing, Closing, Closed };

class Connection : public std::enable_shared_from_this<Connection> {
  public:
    using CloseCallback = std::function<void(std::shared_ptr<Connection>)>;
    using DataCallback = std::function<void(std::shared_ptr<Connection>)>;

    static constexpr size_t MAX_READ_BATCH_BYTES = 64 * 1024; // 64 KB bound per tick
    static constexpr size_t MAX_WRITE_BATCH_BYTES = 64 * 1024;

    Connection(EventLoop &loop, int fd, CloseCallback on_close = nullptr,
               DataCallback on_data = nullptr);
    ~Connection();

    Connection(const Connection &) = delete;
    Connection &operator=(const Connection &) = delete;

    void start();
    void close();

    // Data send API
    void send(const void *data, size_t len);
    void send(std::string_view sv);
    void flush();

    [[nodiscard]] int fd() const noexcept { return fd_; }
    [[nodiscard]] ConnectionState state() const noexcept { return state_; }
    [[nodiscard]] core::Buffer &in_buffer() noexcept { return in_buf_; }
    [[nodiscard]] core::Buffer &out_buffer() noexcept { return out_buf_; }

    void set_data_callback(DataCallback cb) { on_data_ = std::move(cb); }
    void set_close_callback(CloseCallback cb) { on_close_ = std::move(cb); }

  private:
    void handle_events(uint32_t events);
    void handle_read();
    void handle_write();
    void update_epoll_events();

    EventLoop &loop_;
    int fd_{-1};
    ConnectionState state_{ConnectionState::Connected};

    core::Buffer in_buf_;
    core::Buffer out_buf_;

    CloseCallback on_close_;
    DataCallback on_data_;

    uint32_t registered_events_{0};
    bool is_closed_{false};
};

} // namespace redisx::net

#endif // REDISX_NET_CONNECTION_H
