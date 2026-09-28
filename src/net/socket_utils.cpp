#include "redisx/net/socket_utils.h"

#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>

namespace redisx::net {

core::Result<void> set_nonblocking(int fd) noexcept {
    int flags = ::fcntl(fd, F_GETFL, 0);
    if (flags == -1) {
        return core::ErrorCode::SystemError;
    }
    if (::fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
        return core::ErrorCode::SystemError;
    }
    return {};
}

core::Result<void> set_tcp_nodelay(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
    if (::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
    return {};
}

core::Result<void> set_reuse_addr(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
    if (::setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
    return {};
}

core::Result<void> set_reuse_port(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
#ifdef SO_REUSEPORT
    if (::setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#endif
    return {};
}

core::Result<void> set_keepalive(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
    if (::setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
    return {};
}

} // namespace redisx::net
