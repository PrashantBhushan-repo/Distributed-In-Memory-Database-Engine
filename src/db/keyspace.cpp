#include "redisx/db/keyspace.h"

#include <stdexcept>
#include "redisx/core/time.h"
#include "redisx/memory/lfu.h"

namespace redisx::db {

Dict &Keyspace::get_db(std::size_t db_idx) {
    if (!is_valid_db(db_idx)) {
        throw std::out_of_range("Invalid database index");
    }
    return dbs_[db_idx];
}

const Dict &Keyspace::get_db(std::size_t db_idx) const {
    if (!is_valid_db(db_idx)) {
        throw std::out_of_range("Invalid database index");
    }
    return dbs_[db_idx];
}

bool Keyspace::db_set(std::size_t db_idx, std::string key, Value val, std::uint64_t expire_at_ms) {
    return get_db(db_idx).insert_or_assign(std::move(key), std::move(val), expire_at_ms);
}

Entry *Keyspace::db_get(std::size_t db_idx, std::string_view key) {
    if (expiration_check_ && expiration_check_(db_idx, key)) return nullptr;
    auto *entry = get_db(db_idx).find(key);
    if (entry) {
        const auto now = static_cast<std::uint32_t>((core::monotonic_now_ms() / 1000) & 0xffffff);
        const auto minutes = static_cast<std::uint32_t>((core::monotonic_now_ms() / 60000) & 0xffff);
        entry->lru_clock = now;
        entry->lfu_freq = memory::lfu_log_incr(memory::lfu_decay_counter(entry->lfu_freq, entry->lfu_last_decay, minutes));
        entry->lfu_last_decay = minutes;
    }
    return entry;
}

const Entry *Keyspace::db_get(std::size_t db_idx, std::string_view key) const {
    if (expiration_check_ && expiration_check_(db_idx, key)) return nullptr;
    return get_db(db_idx).find(key);
}

bool Keyspace::db_delete(std::size_t db_idx, std::string_view key) {
    return get_db(db_idx).erase(key);
}

bool Keyspace::db_exists(std::size_t db_idx, std::string_view key) const {
    return db_get(db_idx, key) != nullptr;
}

std::size_t Keyspace::db_size(std::size_t db_idx) const {
    return get_db(db_idx).size();
}

void Keyspace::flush_db(std::size_t db_idx) {
    get_db(db_idx).clear();
}

void Keyspace::flush_all() {
    for (auto &dict : dbs_) {
        dict.clear();
    }
}

void Keyspace::rehash_step_all(std::size_t n_buckets) {
    for (auto &dict : dbs_) {
        if (dict.is_rehashing()) {
            dict.rehash_step(n_buckets);
        }
    }
}

} // namespace redisx::db
