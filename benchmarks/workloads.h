#ifndef REDISX_BENCH_WORKLOADS_H
#define REDISX_BENCH_WORKLOADS_H

#include <cstddef>
#include <cstdint>
#include <random>
#include <string>
#include <vector>

namespace redisx::bench {

enum class WorkloadType {
    ReadHeavy,    // 95% GET, 5% SET
    WriteHeavy,   // 50% SET, 50% GET
    CacheZipfian, // Zipfian access distribution + SETEX TTL + Eviction
    Pipelined     // Pipelined burst batches
};

struct WorkloadConfig {
    std::size_t key_count = 100000;
    std::size_t min_val_size = 64;
    std::size_t max_val_size = 1024;
    std::size_t client_count = 50;
    std::size_t pipeline_depth = 16;
    double zipf_skew = 0.99; // Standard Zipf parameter
    std::uint32_t ttl_seconds = 300;
    std::uint64_t seed = 0xCAFEBABE1337ULL;
};

// Fast Zipfian key index generator using inverse transform sampling
class ZipfianGenerator {
public:
    ZipfianGenerator(std::size_t items, double skew, std::uint64_t seed);

    std::size_t next();

private:
    std::size_t items_;
    double skew_;
    double zeta_n_;
    double eta_;
    std::mt19937_64 rng_;
    std::uniform_real_distribution<double> dist_{0.0, 1.0};

    static double compute_zeta(std::size_t n, double theta);
};

// Main Workload Generator
class WorkloadGenerator {
public:
    explicit WorkloadGenerator(WorkloadConfig config);

    // Generate single command wire bytes in standard RESP multibulk format (*<n>\r\n$<len>\r\n...)
    std::string next_command(WorkloadType type);

    // Generate a batch of pipelined commands
    std::string next_pipeline(WorkloadType type, std::size_t count);

    // Direct key and value utilities
    std::string get_key(std::size_t index) const;
    std::string generate_random_value();

    const WorkloadConfig &config() const { return config_; }

private:
    WorkloadConfig config_;
    std::mt19937_64 rng_;
    std::uniform_int_distribution<std::size_t> uniform_key_dist_;
    std::uniform_int_distribution<std::size_t> val_size_dist_;
    std::uniform_int_distribution<int> op_dist_{0, 99};
    ZipfianGenerator zipf_gen_;

    static std::string format_resp(const std::vector<std::string> &args);
};

} // namespace redisx::bench

#endif // REDISX_BENCH_WORKLOADS_H
