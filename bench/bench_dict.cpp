#include <benchmark/benchmark.h>
#include "redisx/db/dict.h"
#include "redisx/types/object.h"

#include <string>
#include <vector>

namespace {

// Benchmark Dict insertion throughput
static void BM_DictInsert(benchmark::State &state) {
    const std::size_t n = static_cast<std::size_t>(state.range(0));
    std::vector<std::string> keys;
    keys.reserve(n);
    for (std::size_t i = 0; i < n; ++i) {
        keys.push_back("key:" + std::to_string(i));
    }

    for (auto _ : state) {
        state.PauseTiming();
        redisx::db::Dict dict;
        state.ResumeTiming();

        for (std::size_t i = 0; i < n; ++i) {
            dict.insert_or_assign(keys[i], redisx::db::Value("val"));
        }
    }
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(n));
}
BENCHMARK(BM_DictInsert)->Range(1000, 100000);

// Benchmark Dict lookup under varying load factors
static void BM_DictLookup_LoadFactor(benchmark::State &state) {
    const std::size_t table_size = 65536;
    const double load_factor = static_cast<double>(state.range(0)) / 100.0;
    const std::size_t key_count = static_cast<std::size_t>(static_cast<double>(table_size) * load_factor);

    redisx::db::Dict dict;
    dict.expand(table_size);

    std::vector<std::string> keys;
    keys.reserve(key_count);
    for (std::size_t i = 0; i < key_count; ++i) {
        keys.push_back("k_" + std::to_string(i));
        dict.insert_or_assign(keys.back(), redisx::db::Value("v"));
    }

    std::size_t idx = 0;
    for (auto _ : state) {
        const auto &key = keys[idx++ % key_count];
        benchmark::DoNotOptimize(dict.find(key));
    }
    state.SetItemsProcessed(state.iterations());
}
// Test load factors: 0.25, 0.50, 0.75, 1.00, 1.50
BENCHMARK(BM_DictLookup_LoadFactor)->Arg(25)->Arg(50)->Arg(75)->Arg(100)->Arg(150);

// Benchmark Dict lookup during active incremental rehashing (split across ht[0] and ht[1])
static void BM_DictLookup_DuringRehash(benchmark::State &state) {
    const std::size_t key_count = 32768;
    redisx::db::Dict dict;
    dict.expand(key_count);

    std::vector<std::string> keys;
    keys.reserve(key_count);
    for (std::size_t i = 0; i < key_count; ++i) {
        keys.push_back("rehash_key_" + std::to_string(i));
        dict.insert_or_assign(keys.back(), redisx::db::Value("val"));
    }

    // Trigger expansion to start rehashing into table 1
    dict.expand(key_count * 2);
    // Migrate half the buckets so lookups touch both ht[0] and ht[1]
    dict.rehash_step(key_count / 2);

    std::size_t idx = 0;
    for (auto _ : state) {
        const auto &key = keys[idx++ % key_count];
        benchmark::DoNotOptimize(dict.find(key));
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_DictLookup_DuringRehash);

// Benchmark incremental rehash step cost
static void BM_DictRehashStep(benchmark::State &state) {
    const std::size_t key_count = 65536;

    for (auto _ : state) {
        state.PauseTiming();
        redisx::db::Dict dict;
        dict.expand(key_count);
        for (std::size_t i = 0; i < key_count; ++i) {
            dict.insert_or_assign("key_" + std::to_string(i), redisx::db::Value("v"));
        }
        dict.expand(key_count * 2);
        state.ResumeTiming();

        while (dict.is_rehashing()) {
            dict.rehash_step(16);
        }
    }
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(key_count));
}
BENCHMARK(BM_DictRehashStep);

} // namespace

BENCHMARK_MAIN();
