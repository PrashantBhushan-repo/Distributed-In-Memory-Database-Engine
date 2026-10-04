#ifndef REDISX_MEMORY_LFU_H
#define REDISX_MEMORY_LFU_H

#include <cstdint>
#include <random>

namespace redisx::memory {

constexpr uint8_t LFU_INIT_VAL = 5;

// Generates 24-bit LRU clock (in minutes mod 2^24)
uint32_t get_lru_clock() noexcept;

// Computes 8-bit LFU counter decay over time
uint8_t lfu_decay_counter(uint8_t counter, uint32_t ldt, uint32_t now_min, uint32_t decay_time = 1) noexcept;

// Probabilistically increments 8-bit logarithmic LFU counter
uint8_t lfu_log_incr(uint8_t counter, double log_factor = 10.0) noexcept;

} // namespace redisx::memory

#endif // REDISX_MEMORY_LFU_H
