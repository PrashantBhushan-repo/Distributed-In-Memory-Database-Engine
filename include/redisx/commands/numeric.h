#pragma once
#include <charconv>
#include <stdexcept>
#include <string_view>
namespace redisx::commands {
inline std::int64_t parse_integer(std::string_view text) {
    std::int64_t value = 0;
    auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (error != std::errc{} || end != text.data() + text.size()) throw std::invalid_argument("integer");
    return value;
}
}
