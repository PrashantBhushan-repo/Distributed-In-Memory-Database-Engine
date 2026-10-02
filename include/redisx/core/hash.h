#ifndef REDISX_CORE_HASH_H
#define REDISX_CORE_HASH_H

#include <cstddef>
#include <cstdint>
#include <string_view>

namespace redisx::core {

// SipHash-1-2 implementation for HashDoS resistance.
// Uses a 128-bit random seed (seed[0], seed[1]) generated at startup.
std::uint64_t siphash12(const void *data, std::size_t len, const std::uint64_t seed[2]) noexcept;

// Returns the process-wide global random SipHash seed
const std::uint64_t *get_global_hash_seed() noexcept;

// Convenience hash functions using the global seed
std::uint64_t hash_bytes(const void *data, std::size_t len) noexcept;
std::uint64_t hash_string(std::string_view sv) noexcept;

} // namespace redisx::core

#endif // REDISX_CORE_HASH_H
