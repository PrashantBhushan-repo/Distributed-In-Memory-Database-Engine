#include "redisx/memory/lfu.h"

#include <chrono>

namespace redisx::memory {

uint32_t get_lru_clock() noexcept {
    auto now = std::chrono::steady_clock::now().time_since_epoch();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
    return static_cast<uint32_t>((ms / 1000) & 0x00FFFFFF);
}

uint8_t lfu_decay_counter(uint8_t counter, uint32_t ldt, uint32_t now_min, uint32_t decay_time) noexcept {
    if (decay_time == 0) return counter;

    uint32_t num_periods;
    if (now_min >= ldt) {
        num_periods = now_min - ldt;
    } else {
        num_periods = (65535 - ldt) + now_min; // Wrap around for 16-bit ldt
    }

    uint32_t decrement = num_periods / decay_time;
    if (decrement >= counter) {
        return 0;
    }
    return static_cast<uint8_t>(counter - decrement);
}

uint8_t lfu_log_incr(uint8_t counter, double log_factor) noexcept {
    if (counter == 255) return 255;

    static thread_local std::mt19937 rng(std::random_device{}());
    std::uniform_real_distribution<double> dist(0.0, 1.0);

    double base = static_cast<double>(counter - LFU_INIT_VAL);
    if (base < 0) base = 0;

    double p = 1.0 / (base * log_factor + 1.0);
    if (dist(rng) < p) {
        counter++;
    }
    return counter;
}

} // namespace redisx::memory
