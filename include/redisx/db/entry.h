#ifndef REDISX_DB_ENTRY_H
#define REDISX_DB_ENTRY_H

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <variant>

namespace redisx::db {

enum class ValueType : std::uint8_t {
    String = 0,
    List,
    Hash,
    Set,
    ZSet
};

constexpr std::string_view to_string(ValueType type) noexcept {
    switch (type) {
    case ValueType::String: return "string";
    case ValueType::List:   return "list";
    case ValueType::Hash:   return "hash";
    case ValueType::Set:    return "set";
    case ValueType::ZSet:   return "zset";
    }
    return "unknown";
}

class Value {
  public:
    Value() : data_(std::string{}) {}
    explicit Value(std::string str) : data_(std::move(str)) {}

    [[nodiscard]] ValueType type() const noexcept {
        return static_cast<ValueType>(data_.index());
    }

    [[nodiscard]] bool is_string() const noexcept {
        return std::holds_alternative<std::string>(data_);
    }

    [[nodiscard]] const std::string &as_string() const {
        return std::get<std::string>(data_);
    }

    [[nodiscard]] std::string &as_string() {
        return std::get<std::string>(data_);
    }

  private:
    std::variant<std::string> data_;
};

struct Entry {
    std::string key;
    Value value;
    std::uint64_t expire_at_ms{0}; // 0 = no TTL
    std::uint64_t lru_clock{0};
    std::uint8_t lfu_freq{0};
    Entry *next{nullptr};

    Entry(std::string k, Value v, std::uint64_t exp = 0)
        : key(std::move(k)), value(std::move(v)), expire_at_ms(exp) {}
};

} // namespace redisx::db

#endif // REDISX_DB_ENTRY_H
