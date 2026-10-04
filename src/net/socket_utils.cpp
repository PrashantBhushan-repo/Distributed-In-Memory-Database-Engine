#include "redisx/net/socket_utils.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace redisx::net {

core::Result<void> set_nonblocking(int fd) noexcept {
#ifdef _WIN32
    u_long mode = 1;
    if (::ioctlsocket(static_cast<SOCKET>(fd), static_cast<long>(FIONBIO), &mode) != 0) {
        return core::ErrorCode::SystemError;
    }
#else
    int flags = ::fcntl(fd, F_GETFL, 0);
    if (flags == -1) {
        return core::ErrorCode::SystemError;
    }
    if (::fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
        return core::ErrorCode::SystemError;
    }
#endif
    return {};
}

core::Result<void> set_tcp_nodelay(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
#ifdef _WIN32
    if (::setsockopt(static_cast<SOCKET>(fd), IPPROTO_TCP, TCP_NODELAY, reinterpret_cast<const char *>(&opt), sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#else
    if (::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#endif
    return {};
}

core::Result<void> set_reuse_addr(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
#ifdef _WIN32
    if (::setsockopt(static_cast<SOCKET>(fd), SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char *>(&opt), sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#else
    if (::setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#endif
    return {};
}

core::Result<void> set_reuse_port(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
#ifdef SO_REUSEPORT
    if (::setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#else
    (void)fd; (void)enable; (void)opt;
#endif
    return {};
}

core::Result<void> set_keepalive(int fd, bool enable) noexcept {
    int opt = enable ? 1 : 0;
#ifdef _WIN32
    if (::setsockopt(static_cast<SOCKET>(fd), SOL_SOCKET, SO_KEEPALIVE, reinterpret_cast<const char *>(&opt), sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#else
    if (::setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) < 0) {
        return core::ErrorCode::SystemError;
    }
#endif
    return {};
}

} // namespace redisx::net
