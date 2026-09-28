#ifndef REDISX_NET_SOCKET_UTILS_H
#define REDISX_NET_SOCKET_UTILS_H

#include "redisx/core/errors.h"
#include <cstdint>

namespace redisx::net {

core::Result<void> set_nonblocking(int fd) noexcept;
core::Result<void> set_tcp_nodelay(int fd, bool enable = true) noexcept;
core::Result<void> set_reuse_addr(int fd, bool enable = true) noexcept;
core::Result<void> set_reuse_port(int fd, bool enable = true) noexcept;
core::Result<void> set_keepalive(int fd, bool enable = true) noexcept;

} // namespace redisx::net

#endif // REDISX_NET_SOCKET_UTILS_H
