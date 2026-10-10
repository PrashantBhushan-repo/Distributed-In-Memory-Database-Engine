#include "redisx/security/tls.h"

#include <cerrno>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <io.h>
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

namespace redisx::security {

ssize_t PlainTransport::read(void *buf, size_t count) {
    if (fd_ < 0) return -1;
    return sock_read(fd_, buf, count);
}

ssize_t PlainTransport::write(const void *buf, size_t count) {
    if (fd_ < 0) return -1;
    return sock_write(fd_, buf, count);
}

void PlainTransport::close() {
    if (fd_ >= 0) {
        sock_close(fd_);
        fd_ = -1;
    }
}

TlsTransport::TlsTransport(int fd, const std::string &, const std::string &)
    : fd_(fd) {}

ssize_t TlsTransport::read(void *buf, size_t count) {
    if (fd_ < 0) return -1;
    return sock_read(fd_, buf, count);
}

ssize_t TlsTransport::write(const void *buf, size_t count) {
    if (fd_ < 0) return -1;
    return sock_write(fd_, buf, count);
}

void TlsTransport::close() {
    if (fd_ >= 0) {
        sock_close(fd_);
        fd_ = -1;
    }
}

} // namespace redisx::security
