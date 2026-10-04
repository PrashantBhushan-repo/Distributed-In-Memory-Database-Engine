#ifndef REDISX_MEMORY_EVICTION_H
#define REDISX_MEMORY_EVICTION_H

#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace redisx::memory {

enum class EvictionPolicy {
    NoEviction = 0,
    AllKeysLRU,
    VolatileLRU,
    AllKeysLFU,
    VolatileLFU,
    AllKeysRandom,
    VolatileRandom,
    VolatileTTL
};

constexpr std::string_view to_string(EvictionPolicy policy) noexcept {
    switch (policy) {
    case EvictionPolicy::NoEviction:     return "noeviction";
    case EvictionPolicy::AllKeysLRU:     return "allkeys-lru";
    case EvictionPolicy::VolatileLRU:    return "volatile-lru";
    case EvictionPolicy::AllKeysLFU:     return "allkeys-lfu";
    case EvictionPolicy::VolatileLFU:    return "volatile-lfu";
    case EvictionPolicy::AllKeysRandom:  return "allkeys-random";
    case EvictionPolicy::VolatileRandom: return "volatile-random";
    case EvictionPolicy::VolatileTTL:    return "volatile-ttl";
    }
    return "noeviction";
}

struct EvictionCandidate {
    std::size_t db_idx{0};
    std::string key;
    uint64_t score{0}; // Idle time (ms), inverse LFU freq, or expire_at_ms
};

class EvictionManager {
  public:
    EvictionManager() = default;

    void set_policy(EvictionPolicy policy) noexcept { policy_ = policy; }
    [[nodiscard]] EvictionPolicy policy() const noexcept { return policy_; }

    void set_maxmemory(size_t maxmem) noexcept { maxmemory_ = maxmem; }
    [[nodiscard]] size_t maxmemory() const noexcept { return maxmemory_; }

    void set_samples(size_t samples) noexcept { samples_ = samples; }
    [[nodiscard]] size_t samples() const noexcept { return samples_; }

    [[nodiscard]] uint64_t evicted_keys() const noexcept { return evicted_keys_; }

    // Performs eviction step when memory exceeds maxmemory limit
    // Returns true if memory is now under limit or eviction freed keys
    bool perform_eviction(db::Keyspace &keyspace, db::TTLManager &ttl_mgr);

  private:
    EvictionPolicy policy_{EvictionPolicy::NoEviction};
    size_t maxmemory_{0}; // 0 = unlimited
    size_t samples_{5};
    uint64_t evicted_keys_{0};
    std::vector<EvictionCandidate> pool_; // Max 16 candidates
};

} // namespace redisx::memory

#endif // REDISX_MEMORY_EVICTION_H
