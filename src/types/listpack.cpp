#include "redisx/types/listpack.h"
#include <bit>
#include <charconv>
#include <stdexcept>
namespace redisx::types {
namespace {
void put_varint(std::vector<std::uint8_t> &data, std::uint64_t value) {
    do { auto byte = static_cast<std::uint8_t>(value & 127); value >>= 7; data.push_back(static_cast<std::uint8_t>(byte | (value ? 128 : 0))); } while (value);
}
std::uint64_t get_varint(const std::vector<std::uint8_t> &data, std::size_t &position) {
    std::uint64_t value = 0;
    for (unsigned shift = 0; shift < 64 && position < data.size(); shift += 7) {
        const auto byte = data[position++]; value |= static_cast<std::uint64_t>(byte & 127) << shift;
        if (!(byte & 128)) return value;
    }
    throw std::out_of_range("invalid packed integer");
}
std::vector<std::uint8_t> encode(std::string_view value) {
    std::vector<std::uint8_t> data;
    std::int64_t integer = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), integer);
    if (!value.empty() && error == std::errc{} && end == value.data() + value.size() && std::to_string(integer) == value) {
        data.push_back(1);
        const auto zigzag = (static_cast<std::uint64_t>(integer) << 1) ^ (integer < 0 ? UINT64_MAX : 0);
        put_varint(data, zigzag);
    } else {
        data.push_back(0); put_varint(data, value.size());
        data.insert(data.end(), value.begin(), value.end());
    }
    return data;
}
}
Listpack::Listpack() = default;
std::pair<std::string, std::size_t> Listpack::decode(std::size_t position) const {
    const auto kind = data_.at(position++);
    const auto value = get_varint(data_, position);
    if (kind == 1) {
        const auto bits = (value >> 1) ^ (0 - (value & 1));
        return {std::to_string(std::bit_cast<std::int64_t>(bits)), position};
    }
    if (value > data_.size() - position) throw std::out_of_range("invalid packed string");
    return {std::string(reinterpret_cast<const char *>(data_.data() + position), static_cast<std::size_t>(value)), position + static_cast<std::size_t>(value)};
}
std::size_t Listpack::offset(std::size_t index) const {
    std::size_t position = 0;
    for (std::size_t i = 0; i < index; ++i) position = decode(position).second;
    return position;
}
void Listpack::push_back(std::string_view value) { insert(count_, value); }
void Listpack::push_front(std::string_view value) { insert(0, value); }
bool Listpack::insert(std::size_t index, std::string_view value) {
    if (index > count_) return false;
    const auto position = offset(index);
    const auto bytes = encode(value);
    data_.insert(data_.begin() + static_cast<std::ptrdiff_t>(position), bytes.begin(), bytes.end()); ++count_; return true;
}
bool Listpack::remove(std::size_t index) {
    if (index >= count_) return false;
    const auto position = offset(index), end = decode(position).second;
    data_.erase(data_.begin() + static_cast<std::ptrdiff_t>(position), data_.begin() + static_cast<std::ptrdiff_t>(end)); --count_; return true;
}
bool Listpack::replace(std::size_t index, std::string_view value) {
    if (index >= count_) return false;
    const auto position = offset(index), end = decode(position).second;
    const auto bytes = encode(value);
    if (bytes.size() > end - position) data_.reserve(data_.size() + bytes.size() - (end - position));
    data_.erase(data_.begin() + static_cast<std::ptrdiff_t>(position), data_.begin() + static_cast<std::ptrdiff_t>(end));
    data_.insert(data_.begin() + static_cast<std::ptrdiff_t>(position), bytes.begin(), bytes.end()); return true;
}
std::optional<std::string> Listpack::get(std::size_t index) const {
    if (index >= count_) return std::nullopt;
    return decode(offset(index)).first;
}
std::vector<std::string> Listpack::to_vector() const {
    std::vector<std::string> values; values.reserve(count_);
    std::size_t position = 0;
    while (position < data_.size()) { auto decoded = decode(position); values.push_back(std::move(decoded.first)); position = decoded.second; }
    return values;
}
std::size_t Listpack::bytes() const noexcept { return data_.capacity(); }
}
