#include "redisx/core/time.h"

#include <chrono>
#include <mutex>

namespace redisx::core {

std::uint64_t SystemTimeProvider::monotonic_now_ms() const noexcept {
    using namespace std::chrono;
    return static_cast<std::uint64_t>(
        duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count());
}

std::uint64_t SystemTimeProvider::wall_now_ms() const noexcept {
    using namespace std::chrono;
    return static_cast<std::uint64_t>(
        duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count());
}

static std::shared_ptr<ITimeProvider> g_time_provider = std::make_shared<SystemTimeProvider>();
static std::mutex g_time_mutex;

void set_global_time_provider(std::shared_ptr<ITimeProvider> provider) noexcept {
    std::lock_guard<std::mutex> lock(g_time_mutex);
    if (provider) {
        g_time_provider = std::move(provider);
    } else {
        g_time_provider = std::make_shared<SystemTimeProvider>();
    }
}

std::shared_ptr<ITimeProvider> get_global_time_provider() noexcept {
    std::lock_guard<std::mutex> lock(g_time_mutex);
    return g_time_provider;
}

std::uint64_t monotonic_now_ms() noexcept {
    return get_global_time_provider()->monotonic_now_ms();
}

std::uint64_t wall_now_ms() noexcept {
    return get_global_time_provider()->wall_now_ms();
}

} // namespace redisx::core
