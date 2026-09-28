#include "redisx/core/logging.h"

#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <ctime>
#include <mutex>
#include <vector>

namespace redisx::core {

Logger &Logger::instance() noexcept {
    static Logger logger;
    return logger;
}

void Logger::set_level(LogLevel level) noexcept {
    level_ = level;
}

LogLevel Logger::level() const noexcept {
    return level_;
}

void Logger::log(LogLevel level, const char *fmt, ...) noexcept {
    if (level < level_) {
        return;
    }

    static std::mutex log_mutex;

    // Fast-path stack buffer for zero allocation on messages < 256 bytes
    constexpr size_t STACK_BUF_SIZE = 256;
    char stack_buf[STACK_BUF_SIZE];

    va_list args;
    va_start(args, fmt);
    va_list args_copy;
    va_copy(args_copy, args);

    int needed = std::vsnprintf(stack_buf, STACK_BUF_SIZE, fmt, args);
    va_end(args);

    const char *msg_ptr = stack_buf;
    std::vector<char> heap_buf;

    if (needed >= static_cast<int>(STACK_BUF_SIZE)) {
        heap_buf.resize(static_cast<size_t>(needed) + 1);
        std::vsnprintf(heap_buf.data(), heap_buf.size(), fmt, args_copy);
        msg_ptr = heap_buf.data();
    }
    va_end(args_copy);

    // Get current ISO-8601 / monotonic timestamp
    auto now = std::chrono::system_clock::now();
    auto now_time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;

    std::tm tm_buf{};
#if defined(_WIN32)
    localtime_s(&tm_buf, &now_time_t);
#else
    localtime_r(&now_time_t, &tm_buf);
#endif

    const char *level_str = "INFO";
    switch (level) {
    case LogLevel::TRACE:
        level_str = "TRACE";
        break;
    case LogLevel::DEBUG:
        level_str = "DEBUG";
        break;
    case LogLevel::INFO:
        level_str = "INFO";
        break;
    case LogLevel::WARN:
        level_str = "WARN";
        break;
    case LogLevel::ERROR:
        level_str = "ERROR";
        break;
    default:
        break;
    }

    std::lock_guard<std::mutex> lock(log_mutex);
    std::printf("[%04d-%02d-%02d %02d:%02d:%02d.%03d] [%s] %s\n",
                tm_buf.tm_year + 1900, tm_buf.tm_mon + 1, tm_buf.tm_mday,
                tm_buf.tm_hour, tm_buf.tm_min, tm_buf.tm_sec,
                static_cast<int>(ms.count()), level_str, msg_ptr);
    std::fflush(stdout);
}

} // namespace redisx::core
