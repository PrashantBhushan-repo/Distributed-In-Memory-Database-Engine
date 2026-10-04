#include "redisx/net/listener.h"
#include "redisx/core/logging.h"
#include "redisx/net/socket_utils.h"

#include <cerrno>
#include <cstring>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <io.h>
#ifdef ERROR
#undef ERROR
#endif

static inline ssize_t sock_write(int fd, const void *buf, size_t len) {
    return ::send(static_cast<SOCKET>(fd), static_cast<const char *>(buf), static_cast<int>(len), 0);
}

static inline void sock_close(int fd) {
    ::closesocket(static_cast<SOCKET>(fd));
}

static inline int sock_bind(int fd, const struct sockaddr *addr, int len) {
    return ::bind(static_cast<SOCKET>(fd), addr, len);
}

static inline int sock_listen(int fd, int backlog) {
    return ::listen(static_cast<SOCKET>(fd), backlog);
}

static inline int sock_accept(int fd, struct sockaddr *addr, socklen_t *len) {
    return static_cast<int>(::accept(static_cast<SOCKET>(fd), addr, len));
}
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

static inline ssize_t sock_write(int fd, const void *buf, size_t len) {
    return ::write(fd, buf, len);
}

static inline void sock_close(int fd) {
    ::close(fd);
}

static inline int sock_bind(int fd, const struct sockaddr *addr, socklen_t len) {
    return ::bind(fd, addr, len);
}

static inline int sock_listen(int fd, int backlog) {
    return ::listen(fd, backlog);
}

static inline int sock_accept(int fd, struct sockaddr *addr, socklen_t *len) {
    return ::accept(fd, addr, len);
}
#endif

namespace redisx::net {

Listener::Listener(EventLoop &loop, std::string host, std::uint16_t port, size_t max_clients)
    : loop_(loop), host_(std::move(host)), port_(port), max_clients_(max_clients) {}

Listener::~Listener() {
    stop();
}

core::Result<void> Listener::start() {
    listen_fd_ = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
    if (listen_fd_ < 0) {
        REDISX_LOG_ERROR("Failed to create socket: %s", std::strerror(errno));
        return core::ErrorCode::SystemError;
    }

    set_reuse_addr(listen_fd_, true);
    set_reuse_port(listen_fd_, true);
    set_nonblocking(listen_fd_);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    if (inet_pton(AF_INET, host_.c_str(), &addr.sin_addr) <= 0) {
        REDISX_LOG_ERROR("Invalid host IP address: %s", host_.c_str());
        sock_close(listen_fd_);
        listen_fd_ = -1;
        return core::ErrorCode::InvalidArgument;
    }

    if (sock_bind(listen_fd_, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)) < 0) {
        REDISX_LOG_ERROR("Failed to bind socket to %s:%u: %s", host_.c_str(), port_,
                         std::strerror(errno));
        sock_close(listen_fd_);
        listen_fd_ = -1;
        return core::ErrorCode::SystemError;
    }

    if (sock_listen(listen_fd_, SOMAXCONN) < 0) {
        REDISX_LOG_ERROR("Failed to listen on socket: %s", std::strerror(errno));
        sock_close(listen_fd_);
        listen_fd_ = -1;
        return core::ErrorCode::SystemError;
    }

    REDISX_LOG_INFO("Listener started on %s:%u (max_clients: %llu)", host_.c_str(), port_,
                    static_cast<unsigned long long>(max_clients_));

    return loop_.add_fd(listen_fd_, EPOLLIN, [this](uint32_t /*events*/) { handle_accept(); });
}

void Listener::stop() {
    if (listen_fd_ != -1) {
        loop_.remove_fd(listen_fd_);
        sock_close(listen_fd_);
        listen_fd_ = -1;
    }
    connections_.clear();
}

void Listener::handle_accept() {
    size_t accepts_this_tick = 0;

    while (accepts_this_tick < DEFAULT_MAX_ACCEPTS_PER_TICK) {
        struct sockaddr_in client_addr {};
        socklen_t client_len = sizeof(client_addr);

        int client_fd = sock_accept(listen_fd_, reinterpret_cast<struct sockaddr *>(&client_addr),
                                    &client_len);

        if (client_fd < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) {
                break; // No more incoming connections
            }
            REDISX_LOG_ERROR("Accept failed: %s", std::strerror(errno));
            break;
        }

        accepts_this_tick++;

        // Enforce max_clients limit
        if (connections_.size() >= max_clients_) {
            REDISX_LOG_WARN("max_clients limit (%llu) reached; rejecting new connection on fd %d",
                            static_cast<unsigned long long>(max_clients_), client_fd);
            const char *err_msg = "-ERR max number of clients reached\r\n";
            [[maybe_unused]] auto unused = sock_write(client_fd, err_msg, std::strlen(err_msg));
            sock_close(client_fd);
            continue;
        }

        Connection::DataCallback data_cb = nullptr;
        if (on_new_connection_) {
            data_cb = [this](std::shared_ptr<Connection> c) {
                if (on_new_connection_) {
                    on_new_connection_(c);
                }
            };
        }

        // Create non-blocking connection object
        auto conn = std::make_shared<Connection>(
            loop_, client_fd,
            [this](std::shared_ptr<Connection> c) { remove_connection(c); },
            std::move(data_cb));

        connections_[client_fd] = conn;
        conn->start();
    }
}

void Listener::remove_connection(const std::shared_ptr<Connection> &conn) {
    if (conn) {
        connections_.erase(conn->fd());
    }
}

} // namespace redisx::net
