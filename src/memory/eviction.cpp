#include "redisx/memory/eviction.h"
#include "redisx/memory/accounting.h"
#include "redisx/memory/lfu.h"

#include <algorithm>
#include <random>

namespace redisx::memory {

bool EvictionManager::perform_eviction(db::Keyspace &keyspace, db::TTLManager &ttl_mgr) {
    if (maxmemory_ == 0 || policy_ == EvictionPolicy::NoEviction) {
        return maxmemory_ == 0 || MemoryTracker::instance().used_memory() <= maxmemory_;
    }

    static thread_local std::mt19937 rng(std::random_device{}());

    while (MemoryTracker::instance().used_memory() > maxmemory_) {
        std::string victim_key;
        size_t victim_db = 0;
        bool found_victim = false;

        bool is_volatile = (policy_ == EvictionPolicy::VolatileLRU ||
                            policy_ == EvictionPolicy::VolatileLFU ||
                            policy_ == EvictionPolicy::VolatileRandom ||
                            policy_ == EvictionPolicy::VolatileTTL);

        // Random policies
        if (policy_ == EvictionPolicy::AllKeysRandom || policy_ == EvictionPolicy::VolatileRandom) {
            for (size_t db_idx = 0; db_idx < db::Keyspace::NUM_DATABASES; ++db_idx) {
                const auto &dict = keyspace.get_db(db_idx);
                if (dict.empty()) continue;

                const auto entries = dict.sample_entries(samples_, is_volatile);
                std::vector<std::string> sample_keys;
                for (const auto *entry : entries) sample_keys.push_back(entry->key);

                if (!sample_keys.empty()) {
                    std::uniform_int_distribution<size_t> dist(0, sample_keys.size() - 1);
                    victim_key = sample_keys[dist(rng)];
                    victim_db = db_idx;
                    found_victim = true;
                    break;
                }
            }
        } else {
            // Pool-based approximate sampling (LRU, LFU, TTL)
            pool_.clear();
            uint32_t now_clk = get_lru_clock();

            for (size_t db_idx = 0; db_idx < db::Keyspace::NUM_DATABASES; ++db_idx) {
                const auto &dict = keyspace.get_db(db_idx);
                if (dict.empty()) continue;

                auto sample_entries = dict.sample_entries(samples_, is_volatile);

                if (sample_entries.empty()) continue;

                // Pick up to samples_ random entries
                std::shuffle(sample_entries.begin(), sample_entries.end(), rng);
                size_t sample_count = std::min(samples_, sample_entries.size());

                for (size_t i = 0; i < sample_count; ++i) {
                    const auto *e = sample_entries[i];
                    uint64_t score = 0;

                    if (policy_ == EvictionPolicy::AllKeysLRU || policy_ == EvictionPolicy::VolatileLRU) {
                        uint32_t idle = (now_clk >= e->lru_clock) ? (now_clk - static_cast<uint32_t>(e->lru_clock))
                                                                  : ((0x00FFFFFF - static_cast<uint32_t>(e->lru_clock)) + now_clk);
                        score = idle;
                    } else if (policy_ == EvictionPolicy::AllKeysLFU || policy_ == EvictionPolicy::VolatileLFU) {
                        score = 255 - e->lfu_freq; // Higher score = lower frequency = better candidate
                    } else if (policy_ == EvictionPolicy::VolatileTTL) {
                        score = UINT64_MAX - e->expire_at_ms;
                    }

                    pool_.push_back({db_idx, e->key, score});
                }
            }

            if (!pool_.empty()) {
                // Sort by score descending (highest score = best victim to evict)
                std::sort(pool_.begin(), pool_.end(), [](const EvictionCandidate &a, const EvictionCandidate &b) {
                    return a.score > b.score;
                });

                victim_key = pool_.front().key;
                victim_db = pool_.front().db_idx;
                found_victim = true;
            }
        }

        if (!found_victim) {
            break; // No candidate key could be found to evict
        }

        // Delete victim key
        ttl_mgr.remove_expire(keyspace, victim_db, victim_key);
        if (keyspace.db_delete(victim_db, victim_key)) {
            evicted_keys_++;
            if (on_evict_) on_evict_(victim_db, victim_key);
        }
    }

    return MemoryTracker::instance().used_memory() <= maxmemory_;
}

} // namespace redisx::memory
