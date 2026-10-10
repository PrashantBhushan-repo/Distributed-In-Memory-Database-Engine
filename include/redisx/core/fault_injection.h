#ifndef REDISX_CORE_FAULT_INJECTION_H
#define REDISX_CORE_FAULT_INJECTION_H

#include <cstdint>
#include <mutex>
#include <random>
#include <string>
#include <string_view>
#include <unordered_map>

namespace redisx::core {

enum class FailpointMode {
    Off = 0,
    Once,
    Always,
    Probabilistic
};

struct FailpointConfig {
    FailpointMode mode{FailpointMode::Off};
    double probability{0.0}; // Used when mode == Probabilistic (0.0 to 1.0)
    uint64_t hit_count{0};
    uint64_t fail_count{0};
};

class FaultInjection {
  public:
    static FaultInjection &instance() noexcept {
        static FaultInjection inst;
        return inst;
    }

    void set_failpoint(std::string_view name, FailpointMode mode, double probability = 1.0) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto &cfg = failpoints_[std::string(name)];
        cfg.mode = mode;
        cfg.probability = probability;
    }

    void reset() {
        std::lock_guard<std::mutex> lock(mutex_);
        failpoints_.clear();
    }

    [[nodiscard]] bool should_fail(std::string_view name) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = failpoints_.find(std::string(name));
        if (it == failpoints_.end()) {
            return false;
        }

        auto &cfg = it->second;
        cfg.hit_count++;

        switch (cfg.mode) {
        case FailpointMode::Off:
            return false;

        case FailpointMode::Always:
            cfg.fail_count++;
            return true;

        case FailpointMode::Once:
            cfg.mode = FailpointMode::Off;
            cfg.fail_count++;
            return true;

        case FailpointMode::Probabilistic: {
            if (cfg.probability <= 0.0) return false;
            if (cfg.probability >= 1.0) {
                cfg.fail_count++;
                return true;
            }
            std::uniform_real_distribution<double> dist(0.0, 1.0);
            if (dist(rng_) < cfg.probability) {
                cfg.fail_count++;
                return true;
            }
            return false;
        }
        }
        return false;
    }

    [[nodiscard]] FailpointConfig get_status(std::string_view name) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = failpoints_.find(std::string(name));
        if (it != failpoints_.end()) {
            return it->second;
        }
        return {};
    }

  private:
    FaultInjection();

    std::mutex mutex_;
    std::unordered_map<std::string, FailpointConfig> failpoints_;
    std::mt19937_64 rng_;
};

} // namespace redisx::core

#if defined(REDISX_ENABLE_FAILPOINTS) || !defined(NDEBUG)
#define FAILPOINT(name) (::redisx::core::FaultInjection::instance().should_fail(name))
#else
#define FAILPOINT(name) (false)
#endif

#endif // REDISX_CORE_FAULT_INJECTION_H
