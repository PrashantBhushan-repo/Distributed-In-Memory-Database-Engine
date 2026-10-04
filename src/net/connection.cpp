#include "redisx/net/connection.h"
#include "redisx/core/logging.h"
#include "redisx/net/socket_utils.h"

#include <algorithm>
#include <cerrno>
#include <cstring>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <io.h>
#ifdef ERROR
#undef ERROR
#endif

static inline ssize_t sock_read(int fd, void *buf, size_t len) {
    return ::recv(static_cast<SOCKET>(fd), static_cast<char *>(buf), static_cast<int>(len), 0);
}

static inline ssize_t sock_write(int fd, const void *buf, size_t len) {
    return ::send(static_cast<SOCKET>(fd), static_cast<const char *>(buf), static_cast<int>(len), 0);
}

static inline void sock_close(int fd) {
    ::closesocket(static_cast<SOCKET>(fd));
}
#else
#include <sys/socket.h>
#include <unistd.h>

static inline ssize_t sock_read(int fd, void *buf, size_t len) {
    return ::read(fd, buf, len);
}

static inline ssize_t sock_write(int fd, const void *buf, size_t len) {
    return ::write(fd, buf, len);
}

static inline void sock_close(int fd) {
    ::close(fd);
}
#endif

namespace redisx::net {

Connection::Connection(EventLoop &loop, int fd, CloseCallback on_close, DataCallback on_data)
    : loop_(loop), fd_(fd), on_close_(std::move(on_close)), on_data_(std::move(on_data)) {
    set_nonblocking(fd_);
    set_tcp_nodelay(fd_, true);
}

Connection::~Connection() {
    if (fd_ != -1) {
        sock_close(fd_);
        fd_ = -1;
    }
}

void Connection::start() {
    registered_events_ = EPOLLIN | EPOLLHUP | EPOLLERR;
    auto self = shared_from_this();
    loop_.add_fd(fd_, registered_events_, [self](uint32_t events) {
        self->handle_events(events);
    });
}

void Connection::close() {
    if (is_closed_) {
        return;
    }
    is_closed_ = true;
    state_ = ConnectionState::Closed;

    loop_.remove_fd(fd_);

    if (on_close_) {
        auto self = shared_from_this();
        loop_.queue_deferred([self]() {
            if (self->on_close_) {
                self->on_close_(self);
            }
        });
    }
}

void Connection::send(const void *data, size_t len) {
    if (is_closed_ || len == 0 || data == nullptr) {
        return;
    }

    out_buf_.append(data, len);
    handle_write();
}

void Connection::send(std::string_view sv) {
    send(sv.data(), sv.size());
}

void Connection::flush() {
    if (!is_closed_) {
        handle_write();
    }
}

void Connection::update_epoll_events() {
    if (is_closed_) {
        return;
    }

    uint32_t new_events = EPOLLIN | EPOLLHUP | EPOLLERR;
    if (out_buf_.readable_bytes() > 0) {
        new_events |= EPOLLOUT;
    }

    if (new_events != registered_events_) {
        registered_events_ = new_events;
        loop_.modify_fd(fd_, registered_events_);
    }
}

void Connection::handle_events(uint32_t events) {
    if (is_closed_) {
        return;
    }

    if (events & (EPOLLHUP | EPOLLERR)) {
        close();
        return;
    }

    if (events & EPOLLIN) {
        handle_read();
    }

    if (!is_closed_ && (events & EPOLLOUT)) {
        handle_write();
    }
}

void Connection::handle_read() {
    // Read up to MAX_READ_BATCH_BYTES to prevent event loop starvation
    in_buf_.reserve(MAX_READ_BATCH_BYTES);

    ssize_t nread = sock_read(fd_, in_buf_.writable_data(), MAX_READ_BATCH_BYTES);

    if (nread > 0) {
        in_buf_.produce(static_cast<size_t>(nread));
        if (on_data_) {
            on_data_(shared_from_this());
        }
    } else if (nread == 0) {
        // EOF from client
        close();
    } else {
        if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
            REDISX_LOG_DEBUG("read error on fd %d: %s", fd_, std::strerror(errno));
            close();
        }
    }
}

void Connection::handle_write() {
    if (out_buf_.readable_bytes() == 0) {
        update_epoll_events();
        return;
    }

    size_t to_write = std::min(out_buf_.readable_bytes(), MAX_WRITE_BATCH_BYTES);
    ssize_t nwritten = sock_write(fd_, out_buf_.readable_data(), to_write);

    if (nwritten > 0) {
        out_buf_.consume(static_cast<size_t>(nwritten));
    } else if (nwritten < 0) {
        if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
            REDISX_LOG_DEBUG("write error on fd %d: %s", fd_, std::strerror(errno));
            close();
            return;
        }
    }

    update_epoll_events();
}

} // namespace redisx::net
