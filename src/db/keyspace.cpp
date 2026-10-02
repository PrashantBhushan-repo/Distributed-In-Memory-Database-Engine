#include "redisx/db/keyspace.h"

#include <stdexcept>

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
    return get_db(db_idx).find(key);
}

const Entry *Keyspace::db_get(std::size_t db_idx, std::string_view key) const {
    return get_db(db_idx).find(key);
}

bool Keyspace::db_delete(std::size_t db_idx, std::string_view key) {
    return get_db(db_idx).erase(key);
}

bool Keyspace::db_exists(std::size_t db_idx, std::string_view key) const {
    return get_db(db_idx).contains(key);
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
