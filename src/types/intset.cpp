#include "redisx/types/intset.h"
#include <algorithm>
#include <charconv>
#include <limits>
namespace redisx::types {
bool Intset::is_valid_integer(const std::string &text, std::int64_t &value) {
    if (text.empty()) return false;
    const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
    return error == std::errc{} && end == text.data() + text.size() && std::to_string(value) == text;
}
std::vector<std::int64_t> Intset::values() const {
    return std::visit([](const auto &values) { return std::vector<std::int64_t>(values.begin(), values.end()); }, values_);
}
void Intset::check_and_upgrade_encoding(std::int64_t value) {
    auto needed = value >= INT16_MIN && value <= INT16_MAX ? Encoding::Int16 : value >= INT32_MIN && value <= INT32_MAX ? Encoding::Int32 : Encoding::Int64;
    if (needed <= encoding_) return;
    const auto old = values();
    if (needed == Encoding::Int32) values_ = std::vector<std::int32_t>(old.begin(), old.end());
    else values_ = std::vector<std::int64_t>(old.begin(), old.end());
    encoding_ = needed;
}
bool Intset::add(std::int64_t value) {
    if (contains(value)) return false;
    check_and_upgrade_encoding(value);
    std::visit([&](auto &values) {
        using T = typename std::decay_t<decltype(values)>::value_type;
        auto where = std::lower_bound(values.begin(), values.end(), value);
        values.insert(where, static_cast<T>(value));
    }, values_);
    return true;
}
bool Intset::remove(std::int64_t value) {
    return std::visit([&](auto &values) {
        auto where = std::lower_bound(values.begin(), values.end(), value);
        if (where == values.end() || *where != value) return false;
        values.erase(where); return true;
    }, values_);
}
bool Intset::contains(std::int64_t value) const {
    return std::visit([&](const auto &values) { return std::binary_search(values.begin(), values.end(), value); }, values_);
}
std::optional<std::int64_t> Intset::get(size_t index) const {
    return std::visit([&](const auto &values) -> std::optional<std::int64_t> { if (index >= values.size()) return std::nullopt; return values[index]; }, values_);
}
}
