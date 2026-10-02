#include "redisx/core/hash.h"

#include <cstring>
#include <random>

namespace redisx::core {

namespace {

inline std::uint64_t rotl64(std::uint64_t x, int b) noexcept {
    return (x << b) | (x >> (64 - b));
}

#define SIPROUND                         \
    do {                                 \
        v0 += v1;                        \
        v1 = rotl64(v1, 13);             \
        v1 ^= v0;                        \
        v0 = rotl64(v0, 32);             \
        v3 += v2;                        \
        v2 = rotl64(v2, 16);             \
        v2 ^= v3;                        \
        v0 += v2;                        \
        v2 = rotl64(v2, 21);             \
        v2 ^= v0;                        \
        v3 += v1;                        \
        v1 = rotl64(v1, 17);             \
        v1 ^= v3;                        \
        v3 = rotl64(v3, 32);             \
    } while (0)

struct GlobalSeedHolder {
    std::uint64_t seed[2];
    GlobalSeedHolder() {
        std::random_device rd;
        // Generate random 128-bit seed
        seed[0] = (static_cast<std::uint64_t>(rd()) << 32) | rd();
        seed[1] = (static_cast<std::uint64_t>(rd()) << 32) | rd();
    }
};

const GlobalSeedHolder &get_seed_holder() noexcept {
    static const GlobalSeedHolder instance;
    return instance;
}

} // namespace

std::uint64_t siphash12(const void *data, std::size_t len, const std::uint64_t seed[2]) noexcept {
    std::uint64_t v0 = 0x736f6d6570736575ULL ^ seed[0];
    std::uint64_t v1 = 0x646f72616d626179ULL ^ seed[1];
    std::uint64_t v2 = 0x6c7967656e657261ULL ^ seed[0];
    std::uint64_t v3 = 0x7465646279746573ULL ^ seed[1];

    const auto *bytes = static_cast<const std::uint8_t *>(data);
    const std::size_t left = len & 7;
    const std::size_t blocks = len & ~static_cast<std::size_t>(7);

    for (std::size_t i = 0; i < blocks; i += 8) {
        std::uint64_t m = 0;
        std::memcpy(&m, bytes + i, 8);
        v3 ^= m;
        SIPROUND; // 1 compression round for SipHash-1-2
        v0 ^= m;
    }

    std::uint64_t b = static_cast<std::uint64_t>(len) << 56;
    switch (left) {
    case 7: b |= static_cast<std::uint64_t>(bytes[blocks + 6]) << 48; [[fallthrough]];
    case 6: b |= static_cast<std::uint64_t>(bytes[blocks + 5]) << 40; [[fallthrough]];
    case 5: b |= static_cast<std::uint64_t>(bytes[blocks + 4]) << 32; [[fallthrough]];
    case 4: b |= static_cast<std::uint64_t>(bytes[blocks + 3]) << 24; [[fallthrough]];
    case 3: b |= static_cast<std::uint64_t>(bytes[blocks + 2]) << 16; [[fallthrough]];
    case 2: b |= static_cast<std::uint64_t>(bytes[blocks + 1]) << 8;  [[fallthrough]];
    case 1: b |= static_cast<std::uint64_t>(bytes[blocks + 0]);       break;
    case 0: break;
    }

    v3 ^= b;
    SIPROUND;
    v0 ^= b;

    v2 ^= 0xff;
    SIPROUND; // 2 finalization rounds for SipHash-1-2
    SIPROUND;

    return v0 ^ v1 ^ v2 ^ v3;
}

const std::uint64_t *get_global_hash_seed() noexcept {
    return get_seed_holder().seed;
}

std::uint64_t hash_bytes(const void *data, std::size_t len) noexcept {
    return siphash12(data, len, get_global_hash_seed());
}

std::uint64_t hash_string(std::string_view sv) noexcept {
    return hash_bytes(sv.data(), sv.size());
}

} // namespace redisx::core
