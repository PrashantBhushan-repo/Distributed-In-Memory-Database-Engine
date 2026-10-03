#include "redisx/db/ttl.h"

#include <vector>

namespace redisx::db {

bool TTLManager::expire_if_needed(Keyspace &keyspace, std::size_t db_idx, std::string_view key) {
    if (!Keyspace::is_valid_db(db_idx)) {
        return false;
    }

    Dict &dict = keyspace.get_db(db_idx);
    Entry *e = dict.find(key);
    if (e == nullptr || e->expire_at_ms == 0) {
        return false;
    }

    std::uint64_t now = time_provider_->monotonic_now_ms();
    if (now < e->expire_at_ms) {
        return false; // Not expired yet
    }

    // Key is expired!
    if (replica_mode_) {
        // Replicas do not delete expired keys locally; wait for primary's DEL
        return true;
    }

    dict.erase(key);
    stats_.expired_keys++;
    return true;
}

bool TTLManager::set_expire_at(Keyspace &keyspace, std::size_t db_idx, std::string_view key,
                               std::uint64_t expire_at_ms) {
    if (expire_if_needed(keyspace, db_idx, key)) {
        return false;
    }

    Entry *e = keyspace.db_get(db_idx, key);
    if (e == nullptr) {
        return false;
    }

    e->expire_at_ms = expire_at_ms;
    return true;
}

bool TTLManager::set_expire_after(Keyspace &keyspace, std::size_t db_idx, std::string_view key,
                                  std::uint64_t ttl_ms) {
    std::uint64_t now = time_provider_->monotonic_now_ms();
    return set_expire_at(keyspace, db_idx, key, now + ttl_ms);
}

bool TTLManager::remove_expire(Keyspace &keyspace, std::size_t db_idx, std::string_view key) {
    if (expire_if_needed(keyspace, db_idx, key)) {
        return false;
    }

    Entry *e = keyspace.db_get(db_idx, key);
    if (e == nullptr || e->expire_at_ms == 0) {
        return false;
    }

    e->expire_at_ms = 0;
    return true;
}

std::int64_t TTLManager::get_ttl_ms(Keyspace &keyspace, std::size_t db_idx, std::string_view key) {
    if (expire_if_needed(keyspace, db_idx, key)) {
        return -2; // Expired / does not exist
    }

    Entry *e = keyspace.db_get(db_idx, key);
    if (e == nullptr) {
        return -2;
    }

    if (e->expire_at_ms == 0) {
        return -1; // Key exists, no TTL
    }

    std::uint64_t now = time_provider_->monotonic_now_ms();
    if (now >= e->expire_at_ms) {
        return -2;
    }

    return static_cast<std::int64_t>(e->expire_at_ms - now);
}

std::int64_t TTLManager::get_ttl_seconds(Keyspace &keyspace, std::size_t db_idx, std::string_view key) {
    std::int64_t ttl_ms = get_ttl_ms(keyspace, db_idx, key);
    if (ttl_ms < 0) {
        return ttl_ms;
    }
    // Round up for Redis TTL semantics (e.g. 500ms remaining -> 1s)
    return (ttl_ms + 999) / 1000;
}

std::size_t TTLManager::active_expire_cycle(Keyspace &keyspace, std::uint32_t max_budget_ms) {
    if (replica_mode_) {
        return 0; // Replicas do not run active expiration
    }

    std::uint64_t start_time = time_provider_->monotonic_now_ms();
    std::size_t total_expired = 0;

    for (std::size_t db_idx = 0; db_idx < Keyspace::NUM_DATABASES; ++db_idx) {
        Dict &dict = keyspace.get_db(db_idx);
        if (dict.empty()) {
            continue;
        }

        std::uint64_t cursor = 0;
        std::size_t iterations = 0;
        constexpr std::size_t MAX_ITERATIONS_PER_DB = 16;

        while (iterations < MAX_ITERATIONS_PER_DB) {
            iterations++;
            std::vector<std::string> sampled_keys;
            sampled_keys.reserve(20);

            std::size_t buckets_scanned = 0;
            do {
                cursor = dict.scan(cursor, [&](const Entry *e) {
                    if (e != nullptr && e->expire_at_ms > 0 && sampled_keys.size() < 20) {
                        sampled_keys.push_back(e->key);
                    }
                });
                buckets_scanned++;
            } while (cursor != 0 && sampled_keys.size() < 20 && buckets_scanned < 128);

            if (sampled_keys.empty()) {
                break; // No keys with expiration found in this pass
            }

            std::uint64_t now = time_provider_->monotonic_now_ms();
            std::size_t expired_in_sample = 0;

            for (const auto &key : sampled_keys) {
                Entry *e = dict.find(key);
                if (e != nullptr && e->expire_at_ms > 0 && now >= e->expire_at_ms) {
                    dict.erase(key);
                    expired_in_sample++;
                    total_expired++;
                    stats_.expired_keys++;
                }
            }

            // Check hard time budget limit (1ms default)
            std::uint64_t elapsed = time_provider_->monotonic_now_ms() - start_time;
            if (elapsed >= max_budget_ms) {
                return total_expired; // Hard budget reached, stop cycle
            }

            // Repeat cycle for this DB only if more than 25% of sample was expired
            if (expired_in_sample <= (sampled_keys.size() / 4)) {
                break;
            }
        }
    }

    return total_expired;
}

} // namespace redisx::db
