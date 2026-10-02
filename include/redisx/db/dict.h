#ifndef REDISX_DB_DICT_H
#define REDISX_DB_DICT_H

#include "redisx/db/entry.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string_view>

namespace redisx::db {

struct DictTable {
    Entry **buckets{nullptr};
    std::size_t size{0};
    std::size_t sizemask{0};
    std::size_t used{0};
};

class Dict {
  public:
    static constexpr std::size_t INITIAL_SIZE = 4;

    Dict();
    ~Dict();

    Dict(const Dict &) = delete;
    Dict &operator=(const Dict &) = delete;

    Dict(Dict &&other) noexcept;
    Dict &operator=(Dict &&other) noexcept;

    // Lookups
    [[nodiscard]] Entry *find(std::string_view key) const;
    [[nodiscard]] bool contains(std::string_view key) const;

    // Mutators
    // Inserts or overwrites key with new value and optional expire_at_ms
    bool insert_or_assign(std::string key, Value val, std::uint64_t expire_at_ms = 0);
    bool insert_new(std::string key, Value val, std::uint64_t expire_at_ms = 0);
    bool erase(std::string_view key);

    void clear();

    // Incremental Rehashing API
    bool rehash_step(std::size_t n_buckets = 1);
    [[nodiscard]] bool is_rehashing() const noexcept { return rehash_idx_ != -1; }
    [[nodiscard]] std::int64_t rehash_index() const noexcept { return rehash_idx_; }

    [[nodiscard]] std::size_t size() const noexcept {
        return ht_[0].used + ht_[1].used;
    }
    [[nodiscard]] bool empty() const noexcept { return size() == 0; }
    [[nodiscard]] std::size_t capacity() const noexcept {
        return ht_[0].size + ht_[1].size;
    }

    // Force explicit expansion / resize (for testing / performance)
    bool expand(std::size_t size);
    bool resize_if_needed();

    // Reverse-binary bit-reversal SCAN iteration algorithm
    std::uint64_t scan(std::uint64_t v, const std::function<void(const Entry *)> &fn) const;

  private:
    void _free_table(DictTable &ht);
    Entry *_find_in_table(const DictTable &ht, std::string_view key, std::uint64_t h) const;

    DictTable ht_[2];
    std::int64_t rehash_idx_{-1};
};

} // namespace redisx::db

#endif // REDISX_DB_DICT_H
