#include "redisx/db/dict.h"
#include "redisx/core/hash.h"

#include <algorithm>
#include <cstring>
#include <utility>

namespace redisx::db {

namespace {

// Reverse bits of 64-bit integer for Redis SCAN reverse-binary cursor
std::uint64_t rev(std::uint64_t v) noexcept {
    v = ((v >> 1) & 0x5555555555555555ULL) | ((v & 0x5555555555555555ULL) << 1);
    v = ((v >> 2) & 0x3333333333333333ULL) | ((v & 0x3333333333333333ULL) << 2);
    v = ((v >> 4) & 0x0F0F0F0F0F0F0F0FULL) | ((v & 0x0F0F0F0F0F0F0F0FULL) << 4);
    v = ((v >> 8) & 0x00FF00FF00FF00FFULL) | ((v & 0x00FF00FF00FF00FFULL) << 8);
    v = ((v >> 16) & 0x0000FFFF0000FFFFULL) | ((v & 0x0000FFFF0000FFFFULL) << 16);
    return (v >> 32) | (v << 32);
}

std::size_t next_power_of_two(std::size_t size) noexcept {
    std::size_t p = Dict::INITIAL_SIZE;
    while (p < size) {
        p <<= 1;
    }
    return p;
}

} // namespace

Dict::Dict() {
    ht_[0] = {};
    ht_[1] = {};
}

Dict::~Dict() {
    clear();
}

Dict::Dict(Dict &&other) noexcept {
    ht_[0] = other.ht_[0];
    ht_[1] = other.ht_[1];
    rehash_idx_ = other.rehash_idx_;

    other.ht_[0] = {};
    other.ht_[1] = {};
    other.rehash_idx_ = -1;
}

Dict &Dict::operator=(Dict &&other) noexcept {
    if (this != &other) {
        clear();
        ht_[0] = other.ht_[0];
        ht_[1] = other.ht_[1];
        rehash_idx_ = other.rehash_idx_;

        other.ht_[0] = {};
        other.ht_[1] = {};
        other.rehash_idx_ = -1;
    }
    return *this;
}

void Dict::_free_table(DictTable &ht) {
    if (ht.buckets == nullptr) {
        return;
    }

    for (std::size_t i = 0; i < ht.size; ++i) {
        Entry *curr = ht.buckets[i];
        while (curr != nullptr) {
            Entry *next = curr->next;
            delete curr;
            curr = next;
        }
    }

    delete[] ht.buckets;
    ht = {};
}

void Dict::clear() {
    _free_table(ht_[0]);
    _free_table(ht_[1]);
    rehash_idx_ = -1;
}

bool Dict::expand(std::size_t size) {
    if (is_rehashing() || ht_[0].used > size) {
        return false;
    }

    std::size_t real_size = next_power_of_two(size);
    if (real_size == ht_[0].size) {
        return false;
    }

    DictTable new_ht;
    new_ht.size = real_size;
    new_ht.sizemask = real_size - 1;
    new_ht.used = 0;
    new_ht.buckets = new Entry *[real_size]();

    if (ht_[0].buckets == nullptr) {
        ht_[0] = new_ht;
        return true;
    }

    ht_[1] = new_ht;
    rehash_idx_ = 0;
    return true;
}

bool Dict::resize_if_needed() {
    if (is_rehashing()) {
        return false;
    }

    if (ht_[0].size == 0) {
        return expand(INITIAL_SIZE);
    }

    if (ht_[0].used >= ht_[0].size) {
        return expand(ht_[0].used * 2);
    }

    if (ht_[0].size > INITIAL_SIZE && (ht_[0].used * 100 / ht_[0].size) < 10) {
        std::size_t target_size = std::max(INITIAL_SIZE, ht_[0].used);
        return expand(target_size);
    }

    return false;
}

bool Dict::rehash_step(std::size_t n_buckets) {
    if (!is_rehashing()) {
        return false;
    }

    while (n_buckets > 0 && ht_[0].used > 0) {
        while (rehash_idx_ < static_cast<std::int64_t>(ht_[0].size) &&
               ht_[0].buckets[rehash_idx_] == nullptr) {
            rehash_idx_++;
        }

        if (rehash_idx_ >= static_cast<std::int64_t>(ht_[0].size)) {
            break;
        }

        Entry *curr = ht_[0].buckets[rehash_idx_];
        while (curr != nullptr) {
            Entry *next = curr->next;
            std::uint64_t h = core::hash_string(curr->key) & ht_[1].sizemask;

            curr->next = ht_[1].buckets[h];
            ht_[1].buckets[h] = curr;

            ht_[0].used--;
            ht_[1].used++;
            curr = next;
        }

        ht_[0].buckets[rehash_idx_] = nullptr;
        rehash_idx_++;
        n_buckets--;
    }

    if (ht_[0].used == 0) {
        delete[] ht_[0].buckets;
        ht_[0] = ht_[1];
        ht_[1] = {};
        rehash_idx_ = -1;
        return false; // Rehash finished
    }

    return true; // More buckets remain
}

Entry *Dict::_find_in_table(const DictTable &ht, std::string_view key, std::uint64_t h) const {
    if (ht.buckets == nullptr || ht.size == 0) {
        return nullptr;
    }

    std::size_t idx = h & ht.sizemask;
    Entry *curr = ht.buckets[idx];
    while (curr != nullptr) {
        if (curr->key == key) {
            return curr;
        }
        curr = curr->next;
    }
    return nullptr;
}

Entry *Dict::find(std::string_view key) const {
    if (size() == 0) {
        return nullptr;
    }

    const_cast<Dict *>(this)->rehash_step(1);

    std::uint64_t h = core::hash_string(key);
    Entry *e = _find_in_table(ht_[0], key, h);
    if (e != nullptr) {
        return e;
    }

    if (is_rehashing()) {
        return _find_in_table(ht_[1], key, h);
    }

    return nullptr;
}

bool Dict::contains(std::string_view key) const {
    return find(key) != nullptr;
}

bool Dict::insert_or_assign(std::string key, Value val, std::uint64_t expire_at_ms) {
    rehash_step(1);

    Entry *existing = find(key);
    if (existing != nullptr) {
        existing->value = std::move(val);
        existing->expire_at_ms = expire_at_ms;
        return false; // Updated existing key
    }

    resize_if_needed();

    int target_idx = is_rehashing() ? 1 : 0;
    std::uint64_t h = core::hash_string(key) & ht_[target_idx].sizemask;

    auto *new_entry = new Entry(std::move(key), std::move(val), expire_at_ms);
    new_entry->next = ht_[target_idx].buckets[h];
    ht_[target_idx].buckets[h] = new_entry;
    ht_[target_idx].used++;

    return true; // Inserted new key
}

bool Dict::insert_new(std::string key, Value val, std::uint64_t expire_at_ms) {
    if (contains(key)) {
        return false;
    }
    return insert_or_assign(std::move(key), std::move(val), expire_at_ms);
}

bool Dict::erase(std::string_view key) {
    if (size() == 0) {
        return false;
    }

    rehash_step(1);

    std::uint64_t h = core::hash_string(key);

    for (int table_idx = 0; table_idx <= 1; ++table_idx) {
        if (table_idx == 1 && !is_rehashing()) {
            break;
        }

        DictTable &ht = ht_[table_idx];
        if (ht.buckets == nullptr || ht.size == 0) {
            continue;
        }

        std::size_t idx = h & ht.sizemask;
        Entry *curr = ht.buckets[idx];
        Entry *prev = nullptr;

        while (curr != nullptr) {
            if (curr->key == key) {
                if (prev != nullptr) {
                    prev->next = curr->next;
                } else {
                    ht.buckets[idx] = curr->next;
                }
                delete curr;
                ht.used--;
                return true;
            }
            prev = curr;
            curr = curr->next;
        }
    }

    return false;
}

std::uint64_t Dict::scan(std::uint64_t v, const std::function<void(const Entry *)> &fn) const {
    if (size() == 0) {
        return 0;
    }

    const DictTable &t0 = ht_[0];
    const DictTable &t1 = ht_[1];

    if (!is_rehashing()) {
        std::size_t mask = t0.sizemask;
        Entry *curr = t0.buckets[v & mask];
        while (curr != nullptr) {
            fn(curr);
            curr = curr->next;
        }

        v |= ~mask;
        v = rev(v);
        v++;
        v = rev(v);
        return v;
    }

    // Scan during active rehash
    std::size_t m0 = t0.sizemask;
    std::size_t m1 = t1.sizemask;

    // Emit t0 bucket
    Entry *curr = t0.buckets[v & m0];
    while (curr != nullptr) {
        fn(curr);
        curr = curr->next;
    }

    // Emit t1 sub-buckets
    do {
        curr = t1.buckets[v & m1];
        while (curr != nullptr) {
            fn(curr);
            curr = curr->next;
        }
        v |= ~m1;
        v = rev(v);
        v++;
        v = rev(v);
    } while (v & (m0 ^ m1));

    return v;
}

} // namespace redisx::db
