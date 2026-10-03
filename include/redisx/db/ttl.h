#ifndef REDISX_DB_TTL_H
#define REDISX_DB_TTL_H

#include "redisx/core/time.h"
#include "redisx/db/keyspace.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <string_view>

namespace redisx::db {

struct ExpireStats {
    std::uint64_t expired_keys{0};
};

class TTLManager {
  public:
    explicit TTLManager(std::shared_ptr<core::ITimeProvider> time_provider = nullptr)
        : time_provider_(time_provider ? std::move(time_provider) : core::get_global_time_provider()) {}

    ~TTLManager() = default;

    // Time Provider API
    void set_time_provider(std::shared_ptr<core::ITimeProvider> provider) noexcept {
        time_provider_ = std::move(provider);
    }
    [[nodiscard]] core::ITimeProvider &time_provider() const noexcept {
        return *time_provider_;
    }

    // Replica mode flag: when set, active expire cycle does not delete keys,
    // and lazy expire returns nil without deleting.
    void set_replica_mode(bool enable) noexcept { replica_mode_ = enable; }
    [[nodiscard]] bool is_replica_mode() const noexcept { return replica_mode_; }

    // Lazy expiration check: returns true if key is expired.
    // If expired and NOT in replica_mode, deletes key from keyspace.
    bool expire_if_needed(Keyspace &keyspace, std::size_t db_idx, std::string_view key);

    // TTL Operations
    bool set_expire_at(Keyspace &keyspace, std::size_t db_idx, std::string_view key, std::uint64_t expire_at_ms);
    bool set_expire_after(Keyspace &keyspace, std::size_t db_idx, std::string_view key, std::uint64_t ttl_ms);
    bool remove_expire(Keyspace &keyspace, std::size_t db_idx, std::string_view key);

    // Returns TTL in milliseconds:
    // -2: key does not exist (or expired)
    // -1: key exists but has no TTL
    // >=0: remaining milliseconds
    [[nodiscard]] std::int64_t get_ttl_ms(Keyspace &keyspace, std::size_t db_idx, std::string_view key);
    [[nodiscard]] std::int64_t get_ttl_seconds(Keyspace &keyspace, std::size_t db_idx, std::string_view key);

    // Active Expire Cycle run from event loop idle tick:
    // Samples keys with expirations across databases, deleting expired ones.
    // Budget: 1ms per cycle maximum. Stops when expired ratio <= 25% or time budget exhausted.
    std::size_t active_expire_cycle(Keyspace &keyspace, std::uint32_t max_budget_ms = 1);

    [[nodiscard]] const ExpireStats &stats() const noexcept { return stats_; }

  private:
    std::shared_ptr<core::ITimeProvider> time_provider_;
    bool replica_mode_{false};
    ExpireStats stats_;
};

} // namespace redisx::db

#endif // REDISX_DB_TTL_H
