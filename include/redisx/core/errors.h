#ifndef REDISX_CORE_ERRORS_H
#define REDISX_CORE_ERRORS_H

#include <cstdint>
#include <string_view>
#include <system_error>
#include <type_traits>
#include <utility>
#include <variant>

namespace redisx::core {

enum class ErrorCode : std::uint8_t {
    Success = 0,
    IoError,
    ProtocolError,
    OutOfMemory,
    InvalidArgument,
    MaxClientsReached,
    Closed,
    NotFound,
    WouldBlock,
    SystemError
};

constexpr std::string_view to_string(ErrorCode code) noexcept {
    switch (code) {
    case ErrorCode::Success:
        return "Success";
    case ErrorCode::IoError:
        return "IO Error";
    case ErrorCode::ProtocolError:
        return "Protocol Error";
    case ErrorCode::OutOfMemory:
        return "Out of Memory";
    case ErrorCode::InvalidArgument:
        return "Invalid Argument";
    case ErrorCode::MaxClientsReached:
        return "Max Clients Reached";
    case ErrorCode::Closed:
        return "Connection Closed";
    case ErrorCode::NotFound:
        return "Not Found";
    case ErrorCode::WouldBlock:
        return "Operation Would Block";
    case ErrorCode::SystemError:
        return "System Error";
    }
    return "Unknown Error";
}

template <typename T> class Result {
  public:
    constexpr Result(const T &value) : data_(value) {}
    constexpr Result(T &&value) : data_(std::move(value)) {}
    constexpr Result(ErrorCode error) : data_(error) {}

    [[nodiscard]] constexpr bool has_value() const noexcept {
        return std::holds_alternative<T>(data_);
    }

    [[nodiscard]] constexpr bool is_error() const noexcept {
        return std::holds_alternative<ErrorCode>(data_);
    }

    [[nodiscard]] constexpr explicit operator bool() const noexcept {
        return has_value();
    }

    [[nodiscard]] constexpr const T &value() const & {
        return std::get<T>(data_);
    }

    [[nodiscard]] constexpr T &value() & {
        return std::get<T>(data_);
    }

    [[nodiscard]] constexpr T &&value() && {
        return std::get<T>(std::move(data_));
    }

    [[nodiscard]] constexpr ErrorCode error() const noexcept {
        if (is_error()) {
            return std::get<ErrorCode>(data_);
        }
        return ErrorCode::Success;
    }

    [[nodiscard]] constexpr T value_or(T &&default_val) const & {
        if (has_value()) {
            return std::get<T>(data_);
        }
        return std::forward<T>(default_val);
    }

  private:
    std::variant<T, ErrorCode> data_;
};

// Specialization for void
template <> class Result<void> {
  public:
    constexpr Result() : error_(ErrorCode::Success) {}
    constexpr Result(ErrorCode error) : error_(error) {}

    [[nodiscard]] constexpr bool has_value() const noexcept {
        return error_ == ErrorCode::Success;
    }

    [[nodiscard]] constexpr bool is_error() const noexcept {
        return error_ != ErrorCode::Success;
    }

    [[nodiscard]] constexpr explicit operator bool() const noexcept {
        return has_value();
    }

    [[nodiscard]] constexpr ErrorCode error() const noexcept {
        return error_;
    }

  private:
    ErrorCode error_;
};

} // namespace redisx::core

#endif // REDISX_CORE_ERRORS_H
