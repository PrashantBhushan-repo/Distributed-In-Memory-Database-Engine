#include "bench/workloads.h"

#include <cmath>
#include <sstream>

namespace redisx::bench {

// ------------------------------------------------------------
// ZipfianGenerator Implementation
// ------------------------------------------------------------
double ZipfianGenerator::compute_zeta(std::size_t n, double theta) {
    double sum = 0.0;
    for (std::size_t i = 1; i <= n; ++i) {
        sum += 1.0 / std::pow(static_cast<double>(i), theta);
    }
    return sum;
}

ZipfianGenerator::ZipfianGenerator(std::size_t items, double skew, std::uint64_t seed)
    : items_(items > 0 ? items : 1),
      skew_(skew),
      zeta_n_(compute_zeta(items_, skew_)),
      eta_((1.0 - std::pow(2.0 / static_cast<double>(items_), 1.0 - skew_)) /
           (1.0 - (compute_zeta(2, skew_) / zeta_n_))),
      rng_(seed) {}

std::size_t ZipfianGenerator::next() {
    double u = dist_(rng_);
    double uz = u * zeta_n_;
    if (uz < 1.0) {
        return 0;
    }
    if (uz < 1.0 + std::pow(0.5, skew_)) {
        return 1 % items_;
    }

    double v = static_cast<double>(items_) * std::pow(eta_ * u - eta_ + 1.0, 1.0 / (1.0 - skew_));
    std::size_t idx = static_cast<std::size_t>(v);
    if (idx >= items_) {
        idx = items_ - 1;
    }
    return idx;
}

// ------------------------------------------------------------
// WorkloadGenerator Implementation
// ------------------------------------------------------------
WorkloadGenerator::WorkloadGenerator(WorkloadConfig config)
    : config_(config),
      rng_(config.seed),
      uniform_key_dist_(0, config.key_count > 0 ? config.key_count - 1 : 0),
      val_size_dist_(config.min_val_size, config.max_val_size),
      zipf_gen_(config.key_count, config.zipf_skew, config.seed ^ 0x55AA55AAULL) {}

std::string WorkloadGenerator::get_key(std::size_t index) const {
    return "key:" + std::to_string(index);
}

std::string WorkloadGenerator::generate_random_value() {
    std::size_t sz = val_size_dist_(rng_);
    std::string val;
    val.reserve(sz);
    static const char charset[] =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    std::uniform_int_distribution<std::size_t> char_dist(0, sizeof(charset) - 2);

    for (std::size_t i = 0; i < sz; ++i) {
        val.push_back(charset[char_dist(rng_)]);
    }
    return val;
}

std::string WorkloadGenerator::format_resp(const std::vector<std::string> &args) {
    std::string resp = "*" + std::to_string(args.size()) + "\r\n";
    for (const auto &arg : args) {
        resp += "$" + std::to_string(arg.size()) + "\r\n" + arg + "\r\n";
    }
    return resp;
}

std::string WorkloadGenerator::next_command(WorkloadType type) {
    int roll = op_dist_(rng_);
    switch (type) {
    case WorkloadType::ReadHeavy: {
        // 95% GET, 5% SET
        if (roll < 95) {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"GET", get_key(idx)});
        } else {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"SET", get_key(idx), generate_random_value()});
        }
    }
    case WorkloadType::WriteHeavy: {
        // 50% SET, 50% GET
        if (roll < 50) {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"SET", get_key(idx), generate_random_value()});
        } else {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"GET", get_key(idx)});
        }
    }
    case WorkloadType::CacheZipfian: {
        // Power-law Zipfian key access + SETEX / TTL
        std::size_t idx = zipf_gen_.next();
        if (roll < 80) { // 80% read hot keys
            return format_resp({"GET", get_key(idx)});
        } else { // 20% write / update with TTL to induce eviction/expiration pressure
            return format_resp({"SETEX", get_key(idx), std::to_string(config_.ttl_seconds), generate_random_value()});
        }
    }
    case WorkloadType::Pipelined: {
        // Alternating reads and writes
        if (roll < 70) {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"GET", get_key(idx)});
        } else {
            std::size_t idx = uniform_key_dist_(rng_);
            return format_resp({"SET", get_key(idx), generate_random_value()});
        }
    }
    }
    return format_resp({"PING"});
}

std::string WorkloadGenerator::next_pipeline(WorkloadType type, std::size_t count) {
    std::string stream;
    for (std::size_t i = 0; i < count; ++i) {
        stream += next_command(type);
    }
    return stream;
}

} // namespace redisx::bench
