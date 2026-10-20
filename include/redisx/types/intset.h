#ifndef REDISX_TYPES_INTSET_H
#define REDISX_TYPES_INTSET_H

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
#include <variant>

namespace redisx::types {

class Intset {
  public:
    enum class Encoding : std::uint8_t {
        Int16 = 2,
        Int32 = 4,
        Int64 = 8
    };

    Intset() = default;
    ~Intset() = default;

    Intset(const Intset &) = default;
    Intset &operator=(const Intset &) = default;
    Intset(Intset &&) noexcept = default;
    Intset &operator=(Intset &&) noexcept = default;

    bool add(std::int64_t value);
    bool remove(std::int64_t value);
    [[nodiscard]] bool contains(std::int64_t value) const;

    [[nodiscard]] std::optional<std::int64_t> get(size_t index) const;
    [[nodiscard]] size_t memory_usage() const { return std::visit([](const auto &values) { return values.capacity() * sizeof(typename std::decay_t<decltype(values)>::value_type); }, values_); }
    [[nodiscard]] size_t size() const noexcept { return std::visit([](const auto &values) { return values.size(); }, values_); }
    [[nodiscard]] Encoding encoding() const noexcept { return encoding_; }
    [[nodiscard]] std::vector<std::int64_t> values() const;

    static bool is_valid_integer(const std::string &str, std::int64_t &out_val);

  private:
    Encoding encoding_{Encoding::Int16};
    std::variant<std::vector<std::int16_t>, std::vector<std::int32_t>, std::vector<std::int64_t>> values_;

    void check_and_upgrade_encoding(std::int64_t value);
};

} // namespace redisx::types

#endif // REDISX_TYPES_INTSET_H
