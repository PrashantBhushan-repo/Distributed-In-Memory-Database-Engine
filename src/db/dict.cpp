#include "redisx/db/dict.h"
#include "redisx/core/hash.h"
#include "redisx/memory/accounting.h"

#include <algorithm>
#include <cstring>
#include <utility>
#include <random>

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
            std::size_t sz = curr->accounted_bytes;
            memory::MemoryTracker::instance().free(sz);
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
    if (scan_depth_ != 0 || is_rehashing() || ht_[0].used > size) {
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
    if (scan_depth_ != 0) return is_rehashing();
    if (!is_rehashing()) {
        return false;
    }

    std::size_t empty_visits = n_buckets > SIZE_MAX / 10 ? SIZE_MAX : n_buckets * 10;
    while (n_buckets > 0 && ht_[0].used > 0) {
        while (rehash_idx_ < static_cast<std::int64_t>(ht_[0].size) &&
               ht_[0].buckets[rehash_idx_] == nullptr) {
            rehash_idx_++;
            if (empty_visits-- == 0) return true;
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
        std::size_t old_sz = existing->accounted_bytes;
        std::size_t new_sz = sizeof(Entry) + key.capacity() + 1 + val.object().memory_usage();
        if (new_sz > old_sz) {
            memory::MemoryTracker::instance().alloc(new_sz - old_sz);
        } else if (old_sz > new_sz) {
            memory::MemoryTracker::instance().free(old_sz - new_sz);
        }
        existing->accounted_bytes = new_sz;
        existing->value = std::move(val);
        existing->expire_at_ms = expire_at_ms;
        return false; // Updated existing key
    }

    resize_if_needed();

    int target_idx = is_rehashing() ? 1 : 0;
    std::uint64_t h = core::hash_string(key) & ht_[target_idx].sizemask;

    std::size_t entry_sz = sizeof(Entry) + key.capacity() + 1 + val.object().memory_usage();
    auto holder = std::make_unique<Entry>(std::move(key), std::move(val), expire_at_ms);
    memory::MemoryTracker::instance().alloc(entry_sz);
    auto *new_entry = holder.release();
    new_entry->accounted_bytes = entry_sz;
    new_entry->next = ht_[target_idx].buckets[h];
    ht_[target_idx].buckets[h] = new_entry;
    ht_[target_idx].used++;

    return true; // Inserted new key
}

std::vector<const Entry *> Dict::sample_entries(std::size_t count, bool volatile_only) const {
    std::vector<const Entry *> sample;
    if (empty() || count == 0) return sample;
    count = std::min<std::size_t>(count, 64);
    static thread_local std::mt19937_64 random(std::random_device{}());
    const auto buckets = ht_[0].size + ht_[1].size;
    for (std::size_t attempt = 0; attempt < count * 32 && sample.size() < count; ++attempt) {
        auto index = static_cast<std::size_t>(random() % buckets);
        const auto &table = index < ht_[0].size ? ht_[0] : ht_[1];
        if (index >= ht_[0].size) index -= ht_[0].size;
        std::size_t visits = 0;
        for (auto *entry = table.buckets[index]; entry && visits++ < 64; entry = entry->next) {
            if ((!volatile_only || entry->expire_at_ms) && std::find(sample.begin(), sample.end(), entry) == sample.end()) sample.push_back(entry);
            if (sample.size() == count) break;
        }
    }
    return sample;
}

void Dict::update_accounting(std::string_view key) {
    auto *entry = find(key);
    if (!entry) return;
    const auto current = sizeof(Entry) + entry->key.capacity() + 1 + entry->value.object().memory_usage();
    if (current > entry->accounted_bytes) memory::MemoryTracker::instance().alloc(current - entry->accounted_bytes);
    else if (current < entry->accounted_bytes) memory::MemoryTracker::instance().free(entry->accounted_bytes - current);
    entry->accounted_bytes = current;
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
                std::size_t sz = curr->accounted_bytes;
                memory::MemoryTracker::instance().free(sz);
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
    struct ScanGuard {
        std::size_t &depth;
        explicit ScanGuard(std::size_t &value) : depth(value) { ++depth; }
        ~ScanGuard() { --depth; }
    } guard(scan_depth_);
    if (size() == 0) {
        return 0;
    }

    const DictTable &t0 = (!is_rehashing() || ht_[0].size <= ht_[1].size) ? ht_[0] : ht_[1];
    const DictTable &t1 = (&t0 == &ht_[0]) ? ht_[1] : ht_[0];

    if (!is_rehashing()) {
        std::size_t mask = t0.sizemask;
        Entry *curr = t0.buckets[v & mask];
        while (curr != nullptr) {
            Entry *next = curr->next;
            fn(curr);
            curr = next;
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
        Entry *next = curr->next;
        fn(curr);
        curr = next;
    }

    // Emit t1 sub-buckets
    do {
        curr = t1.buckets[v & m1];
        while (curr != nullptr) {
            Entry *next = curr->next;
            fn(curr);
            curr = next;
        }
        v |= ~m1;
        v = rev(v);
        v++;
        v = rev(v);
    } while (v & (m0 ^ m1));

    return v;
}

} // namespace redisx::db
