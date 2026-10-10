#ifndef REDISX_SECURITY_AUTH_H
#define REDISX_SECURITY_AUTH_H

#include "redisx/commands/dispatcher.h"

#include <string>
#include <string_view>
#include <unordered_set>

namespace redisx::security {

std::string sha256_hex(std::string_view input);
bool constant_time_equals(std::string_view a, std::string_view b) noexcept;

class AuthEngine {
  public:
    AuthEngine() = default;

    void set_requirepass(std::string password);
    [[nodiscard]] const std::string &requirepass() const noexcept { return requirepass_; }
    [[nodiscard]] bool is_auth_required() const noexcept { return !requirepass_.empty(); }

    [[nodiscard]] bool authenticate(std::string_view password) const;

    [[nodiscard]] bool is_command_allowed_unauthenticated(std::string_view cmd_name) const;

  private:
    std::string requirepass_;
    std::string requirepass_hash_;
};

void register_auth_commands(commands::Dispatcher &dispatcher, AuthEngine &auth_engine);

} // namespace redisx::security

#endif // REDISX_SECURITY_AUTH_H
