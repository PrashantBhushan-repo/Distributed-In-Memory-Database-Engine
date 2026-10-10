#include "redisx/core/fault_injection.h"

#include <algorithm>
#include <cstdlib>
#include <random>

#if defined(_WIN32)
#include <windows.h>
extern char **_environ;
#else
#include <unistd.h>
extern char **environ;
#endif

namespace redisx::core {

FaultInjection::FaultInjection() {
    rng_.seed(std::random_device{}());

    // Scan environment variables for REDISX_FAILPOINT_<NAME>=<mode/prob>
    char **env_ptr =
#if defined(_WIN32)
        _environ;
#else
        environ;
#endif

    if (env_ptr != nullptr) {
        const std::string prefix = "REDISX_FAILPOINT_";
        for (char **curr = env_ptr; *curr != nullptr; ++curr) {
            std::string line(*curr);
            auto eq_pos = line.find('=');
            if (eq_pos == std::string::npos) continue;

            std::string key = line.substr(0, eq_pos);
            std::string val = line.substr(eq_pos + 1);

            if (key.rfind(prefix, 0) == 0) {
                std::string fp_name = key.substr(prefix.size());
                std::transform(fp_name.begin(), fp_name.end(), fp_name.begin(), ::tolower);
                std::transform(val.begin(), val.end(), val.begin(), ::tolower);

                FailpointMode mode = FailpointMode::Always;
                double prob = 1.0;

                if (val == "once") {
                    mode = FailpointMode::Once;
                } else if (val == "always") {
                    mode = FailpointMode::Always;
                } else if (val == "off") {
                    mode = FailpointMode::Off;
                } else {
                    try {
                        prob = std::stod(val);
                        mode = FailpointMode::Probabilistic;
                    } catch (...) {
                        mode = FailpointMode::Always;
                    }
                }

                failpoints_[fp_name] = {mode, prob, 0, 0};
            }
        }
    }
}

} // namespace redisx::core
