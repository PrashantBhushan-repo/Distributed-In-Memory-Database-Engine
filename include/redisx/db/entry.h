#ifndef REDISX_DB_ENTRY_H
#define REDISX_DB_ENTRY_H

#include "redisx/types/object.h"

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>

namespace redisx::db {

using ValueType = redisx::types::ObjectType;

class Value {
  public:
    Value() : obj_(std::string{}) {}
    explicit Value(std::string str) : obj_(std::move(str)) {}
    explicit Value(types::Object obj) : obj_(std::move(obj)) {}

    [[nodiscard]] ValueType type() const noexcept {
        return obj_.type();
    }

    [[nodiscard]] bool is_string() const noexcept {
        return obj_.type() == ValueType::String;
    }

    [[nodiscard]] const std::string &as_string() const {
        return obj_.as_string();
    }

    [[nodiscard]] std::string &as_string() {
        return obj_.as_string();
    }

    [[nodiscard]] const types::Object &object() const noexcept {
        return obj_;
    }

    [[nodiscard]] types::Object &object() noexcept {
        return obj_;
    }

  private:
    types::Object obj_;
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
