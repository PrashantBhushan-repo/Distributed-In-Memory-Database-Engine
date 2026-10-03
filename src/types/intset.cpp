#include "redisx/types/intset.h"

#include <algorithm>
#include <charconv>
#include <limits>

namespace redisx::types {

bool Intset::is_valid_integer(const std::string &str, std::int64_t &out_val) {
    if (str.empty()) return false;
    auto [ptr, ec] = std::from_chars(str.data(), str.data() + str.size(), out_val);
    return ec == std::errc{} && ptr == str.data() + str.size();
}

void Intset::check_and_upgrade_encoding(std::int64_t value) {
    if (value >= std::numeric_limits<std::int16_t>::min() &&
        value <= std::numeric_limits<std::int16_t>::max()) {
        return;
    }
    if (value >= std::numeric_limits<std::int32_t>::min() &&
        value <= std::numeric_limits<std::int32_t>::max()) {
        if (encoding_ < Encoding::Int32) {
            encoding_ = Encoding::Int32;
        }
        return;
    }
    encoding_ = Encoding::Int64;
}

bool Intset::add(std::int64_t value) {
    auto it = std::lower_bound(values_.begin(), values_.end(), value);
    if (it != values_.end() && *it == value) {
        return false; // Already exists
    }
    check_and_upgrade_encoding(value);
    values_.insert(it, value);
    return true;
}

bool Intset::remove(std::int64_t value) {
    auto it = std::lower_bound(values_.begin(), values_.end(), value);
    if (it != values_.end() && *it == value) {
        values_.erase(it);
        return true;
    }
    return false;
}

bool Intset::contains(std::int64_t value) const {
    return std::binary_search(values_.begin(), values_.end(), value);
}

std::optional<std::int64_t> Intset::get(size_t index) const {
    if (index >= values_.size()) {
        return std::nullopt;
    }
    return values_[index];
}

} // namespace redisx::types
