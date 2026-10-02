#ifndef REDISX_DB_KEYSPACE_H
#define REDISX_DB_KEYSPACE_H

#include "redisx/db/dict.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace redisx::db {

class Keyspace {
  public:
    static constexpr std::size_t NUM_DATABASES = 16;

    Keyspace() = default;
    ~Keyspace() = default;

    Keyspace(const Keyspace &) = delete;
    Keyspace &operator=(const Keyspace &) = delete;

    [[nodiscard]] static bool is_valid_db(std::size_t db_idx) noexcept {
        return db_idx < NUM_DATABASES;
    }

    [[nodiscard]] Dict &get_db(std::size_t db_idx);
    [[nodiscard]] const Dict &get_db(std::size_t db_idx) const;

    // Keyspace operations
    bool db_set(std::size_t db_idx, std::string key, Value val, std::uint64_t expire_at_ms = 0);
    [[nodiscard]] Entry *db_get(std::size_t db_idx, std::string_view key);
    [[nodiscard]] const Entry *db_get(std::size_t db_idx, std::string_view key) const;
    bool db_delete(std::size_t db_idx, std::string_view key);
    [[nodiscard]] bool db_exists(std::size_t db_idx, std::string_view key) const;
    [[nodiscard]] std::size_t db_size(std::size_t db_idx) const;

    void flush_db(std::size_t db_idx);
    void flush_all();

    // Incremental rehash tick across all databases
    void rehash_step_all(std::size_t n_buckets = 1);

  private:
    std::array<Dict, NUM_DATABASES> dbs_;
};

} // namespace redisx::db

#endif // REDISX_DB_KEYSPACE_H
