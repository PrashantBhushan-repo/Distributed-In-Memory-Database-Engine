#include "redisx/security/tls.h"
#include <cerrno>
#include <climits>
#include <stdexcept>
#include <openssl/ssl.h>
#include <sys/socket.h>
#include <unistd.h>
namespace redisx::security {
ssize_t PlainTransport::read(void *buf, size_t count) { return ::read(fd_, buf, count); }
ssize_t PlainTransport::write(const void *buf, size_t count) { return ::send(fd_, buf, count, MSG_NOSIGNAL); }
void PlainTransport::close() { if (fd_ >= 0) { ::close(fd_); fd_ = -1; } }
TlsContext::TlsContext(const std::string &cert, const std::string &key) {
    auto *ctx = SSL_CTX_new(TLS_server_method());
    if (!ctx) throw std::runtime_error("Cannot initialize TLS context");
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    SSL_CTX_set_options(ctx, SSL_OP_NO_COMPRESSION);
    if (SSL_CTX_use_certificate_chain_file(ctx, cert.c_str()) != 1 ||
        SSL_CTX_use_PrivateKey_file(ctx, key.c_str(), SSL_FILETYPE_PEM) != 1 || SSL_CTX_check_private_key(ctx) != 1) {
        SSL_CTX_free(ctx); throw std::runtime_error("Cannot load TLS certificate/private key");
    }
    context_ = ctx;
}
TlsContext::~TlsContext() { SSL_CTX_free(static_cast<SSL_CTX *>(context_)); }
TlsTransport::TlsTransport(int fd, const std::string &cert, const std::string &key)
    : TlsTransport(fd, std::make_shared<TlsContext>(cert, key)) {}
TlsTransport::TlsTransport(int fd, std::shared_ptr<TlsContext> context) : fd_(fd), context_(std::move(context)) {
    auto *ssl = SSL_new(static_cast<SSL_CTX *>(context_->native()));
    if (!ssl) throw std::runtime_error("Cannot initialize TLS session");
    SSL_set_fd(ssl, fd);
    SSL_set_accept_state(ssl);
    SSL_set_mode(ssl, SSL_MODE_ENABLE_PARTIAL_WRITE | SSL_MODE_ACCEPT_MOVING_WRITE_BUFFER);
    ssl_ = ssl;
}
ssize_t TlsTransport::translate_result(int result) {
    want_read_ = want_write_ = false;
    if (result > 0) return result;
    const auto error = SSL_get_error(static_cast<SSL *>(ssl_), result);
    if (error == SSL_ERROR_ZERO_RETURN) return 0;
    if (error == SSL_ERROR_WANT_READ || error == SSL_ERROR_WANT_WRITE) {
        want_read_ = error == SSL_ERROR_WANT_READ;
        want_write_ = error == SSL_ERROR_WANT_WRITE;
        errno = EAGAIN; return -1;
    }
    errno = EIO; return -1;
}
ssize_t TlsTransport::read(void *buf, size_t count) {
    return translate_result(SSL_read(static_cast<SSL *>(ssl_), buf, static_cast<int>(std::min(count, static_cast<size_t>(INT_MAX)))));
}
ssize_t TlsTransport::write(const void *buf, size_t count) {
    return translate_result(SSL_write(static_cast<SSL *>(ssl_), buf, static_cast<int>(std::min(count, static_cast<size_t>(INT_MAX)))));
}
void TlsTransport::close() {
    if (ssl_) { SSL_free(static_cast<SSL *>(ssl_)); ssl_ = nullptr; }
    if (fd_ >= 0) { ::close(fd_); fd_ = -1; }
}
}
