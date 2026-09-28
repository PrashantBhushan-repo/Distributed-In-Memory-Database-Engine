#ifndef REDISX_CORE_TIME_H
#define REDISX_CORE_TIME_H

#include <cstdint>
#include <memory>

namespace redisx::core {

class ITimeProvider {
  public:
    virtual ~ITimeProvider() = default;
    [[nodiscard]] virtual std::uint64_t monotonic_now_ms() const noexcept = 0;
    [[nodiscard]] virtual std::uint64_t wall_now_ms() const noexcept = 0;
};

class SystemTimeProvider final : public ITimeProvider {
  public:
    [[nodiscard]] std::uint64_t monotonic_now_ms() const noexcept override;
    [[nodiscard]] std::uint64_t wall_now_ms() const noexcept override;
};

class MockTimeProvider final : public ITimeProvider {
  public:
    explicit MockTimeProvider(std::uint64_t initial_time_ms = 0)
        : monotonic_ms_(initial_time_ms), wall_ms_(initial_time_ms) {}

    [[nodiscard]] std::uint64_t monotonic_now_ms() const noexcept override {
        return monotonic_ms_;
    }

    [[nodiscard]] std::uint64_t wall_now_ms() const noexcept override {
        return wall_ms_;
    }

    void advance_ms(std::uint64_t delta_ms) noexcept {
        monotonic_ms_ += delta_ms;
        wall_ms_ += delta_ms;
    }

    void set_time_ms(std::uint64_t time_ms) noexcept {
        monotonic_ms_ = time_ms;
        wall_ms_ = time_ms;
    }

  private:
    std::uint64_t monotonic_ms_;
    std::uint64_t wall_ms_;
};

// Global default time helper functions
std::uint64_t monotonic_now_ms() noexcept;
std::uint64_t wall_now_ms() noexcept;
void set_global_time_provider(std::shared_ptr<ITimeProvider> provider) noexcept;
std::shared_ptr<ITimeProvider> get_global_time_provider() noexcept;

} // namespace redisx::core

#endif // REDISX_CORE_TIME_H
