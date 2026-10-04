#ifndef REDISX_MEMORY_ACCOUNTING_H
#define REDISX_MEMORY_ACCOUNTING_H

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace redisx::memory {

class MemoryTracker {
  public:
    static MemoryTracker &instance() noexcept {
        static MemoryTracker tracker;
        return tracker;
    }

    void alloc(size_t size) noexcept {
        size_t current = used_memory_.fetch_add(size, std::memory_order_relaxed) + size;
        size_t peak = peak_memory_.load(std::memory_order_relaxed);
        while (current > peak && !peak_memory_.compare_exchange_weak(peak, current, std::memory_order_relaxed)) {
            // Loop until updated
        }
        total_allocations_.fetch_add(1, std::memory_order_relaxed);
    }

    void free(size_t size) noexcept {
        if (used_memory_.load(std::memory_order_relaxed) >= size) {
            used_memory_.fetch_sub(size, std::memory_order_relaxed);
        } else {
            used_memory_.store(0, std::memory_order_relaxed);
        }
        total_frees_.fetch_add(1, std::memory_order_relaxed);
    }

    [[nodiscard]] size_t used_memory() const noexcept {
        return used_memory_.load(std::memory_order_relaxed);
    }

    [[nodiscard]] size_t peak_memory() const noexcept {
        return peak_memory_.load(std::memory_order_relaxed);
    }

    [[nodiscard]] uint64_t total_allocations() const noexcept {
        return total_allocations_.load(std::memory_order_relaxed);
    }

    [[nodiscard]] uint64_t total_frees() const noexcept {
        return total_frees_.load(std::memory_order_relaxed);
    }

    [[nodiscard]] size_t maxmemory() const noexcept {
        return maxmemory_.load(std::memory_order_relaxed);
    }

    void set_maxmemory(size_t maxmem) noexcept {
        maxmemory_.store(maxmem, std::memory_order_relaxed);
    }

    void reset() noexcept {
        used_memory_.store(0);
        peak_memory_.store(0);
        total_allocations_.store(0);
        total_frees_.store(0);
        maxmemory_.store(0);
    }

  private:
    MemoryTracker() = default;
    std::atomic<size_t> used_memory_{0};
    std::atomic<size_t> peak_memory_{0};
    std::atomic<uint64_t> total_allocations_{0};
    std::atomic<uint64_t> total_frees_{0};
    std::atomic<size_t> maxmemory_{0}; // 0 = no limit
};

} // namespace redisx::memory

#endif // REDISX_MEMORY_ACCOUNTING_H
