#ifndef REDISX_SECURITY_TLS_H
#define REDISX_SECURITY_TLS_H

#include <cstddef>
#include <memory>
#include <string>

#ifdef _WIN32
#include <basetsd.h>
typedef SSIZE_T ssize_t;
#else
#include <sys/types.h>
#endif

namespace redisx::security {

class Transport {
  public:
    virtual ~Transport() = default;

    virtual ssize_t read(void *buf, size_t count) = 0;
    virtual ssize_t write(const void *buf, size_t count) = 0;
    virtual void close() = 0;

    [[nodiscard]] virtual bool want_read() const noexcept { return false; }
    [[nodiscard]] virtual bool want_write() const noexcept { return false; }
};

class PlainTransport : public Transport {
  public:
    explicit PlainTransport(int fd) : fd_(fd) {}
    ~PlainTransport() override { close(); }

    ssize_t read(void *buf, size_t count) override;
    ssize_t write(const void *buf, size_t count) override;
    void close() override;

  private:
    int fd_{-1};
};

class TlsTransport : public Transport {
  public:
    TlsTransport(int fd, const std::string &cert_file, const std::string &key_file);
    ~TlsTransport() override { close(); }

    ssize_t read(void *buf, size_t count) override;
    ssize_t write(const void *buf, size_t count) override;
    void close() override;

    [[nodiscard]] bool want_read() const noexcept override { return want_read_; }
    [[nodiscard]] bool want_write() const noexcept override { return want_write_; }

  private:
    int fd_{-1};
    bool want_read_{false};
    bool want_write_{false};
    void *ssl_ctx_{nullptr};
    void *ssl_{nullptr};
};

} // namespace redisx::security

#endif // REDISX_SECURITY_TLS_H
