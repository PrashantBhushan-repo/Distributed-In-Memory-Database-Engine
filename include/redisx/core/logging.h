#ifndef REDISX_CORE_LOGGING_H
#define REDISX_CORE_LOGGING_H

#include <cstdint>
#include <string_view>

namespace redisx::core {

enum class LogLevel : std::uint8_t { TRACE = 0, DEBUG, INFO, WARN, ERROR, NONE };

class Logger {
  public:
    static Logger &instance() noexcept;

    void set_level(LogLevel level) noexcept;
    [[nodiscard]] LogLevel level() const noexcept;

    void log(LogLevel level, const char *fmt, ...) noexcept
        __attribute__((format(printf, 3, 4)));

  private:
    Logger() = default;
    ~Logger() = default;

    LogLevel level_{LogLevel::INFO};
};

#define REDISX_LOG_TRACE(...) ::redisx::core::Logger::instance().log(::redisx::core::LogLevel::TRACE, __VA_ARGS__)
#define REDISX_LOG_DEBUG(...) ::redisx::core::Logger::instance().log(::redisx::core::LogLevel::DEBUG, __VA_ARGS__)
#define REDISX_LOG_INFO(...)  ::redisx::core::Logger::instance().log(::redisx::core::LogLevel::INFO, __VA_ARGS__)
#define REDISX_LOG_WARN(...)  ::redisx::core::Logger::instance().log(::redisx::core::LogLevel::WARN, __VA_ARGS__)
#define REDISX_LOG_ERROR(...) ::redisx::core::Logger::instance().log(::redisx::core::LogLevel::ERROR, __VA_ARGS__)

} // namespace redisx::core

#endif // REDISX_CORE_LOGGING_H
