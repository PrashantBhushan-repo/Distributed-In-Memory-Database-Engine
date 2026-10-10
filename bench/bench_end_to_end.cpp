#include <benchmark/benchmark.h>
#include "bench/workloads.h"
#include "redisx/types/intset.h"
#include "redisx/types/listpack.h"
#include "redisx/types/quicklist.h"
#include "redisx/types/skiplist.h"
#include "redisx/db/dict.h"
#include "redisx/types/object.h"

#include <string>
#include <vector>

namespace {

// Benchmark Skiplist Insert
static void BM_Skiplist_Insert(benchmark::State &state) {
    const std::size_t n = static_cast<std::size_t>(state.range(0));

    for (auto _ : state) {
        state.PauseTiming();
        redisx::types::Skiplist zsl;
        state.ResumeTiming();

        for (std::size_t i = 0; i < n; ++i) {
            zsl.insert(static_cast<double>(i), "m_" + std::to_string(i));
        }
    }
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(n));
}
BENCHMARK(BM_Skiplist_Insert)->Range(100, 10000);

// Benchmark Skiplist Rank Query
static void BM_Skiplist_Rank(benchmark::State &state) {
    const std::size_t n = 10000;
    redisx::types::Skiplist zsl;
    for (std::size_t i = 0; i < n; ++i) {
        zsl.insert(static_cast<double>(i), "m_" + std::to_string(i));
    }

    std::size_t query_idx = 0;
    for (auto _ : state) {
        double score = static_cast<double>(query_idx % n);
        std::string mem = "m_" + std::to_string(query_idx % n);
        benchmark::DoNotOptimize(zsl.get_rank(score, mem));
        query_idx++;
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_Skiplist_Rank);

// Benchmark Encoding Conversion: Listpack -> Quicklist promotion
static void BM_EncodingPromotion_ListpackToQuicklist(benchmark::State &state) {
    const std::size_t entries = 512;
    redisx::types::Listpack lp;
    for (std::size_t i = 0; i < entries; ++i) {
        lp.push_back("entry_" + std::to_string(i));
    }

    for (auto _ : state) {
        redisx::types::Quicklist ql;
        auto vec = lp.to_vector();
        for (const auto &item : vec) {
            ql.push_back(item);
        }
        benchmark::DoNotOptimize(ql.len());
    }
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(entries));
}
BENCHMARK(BM_EncodingPromotion_ListpackToQuicklist);

// Benchmark Encoding Conversion: Intset -> Hashtable (Dict) promotion
static void BM_EncodingPromotion_IntsetToDict(benchmark::State &state) {
    const std::size_t count = 512;
    redisx::types::Intset is;
    for (std::size_t i = 0; i < count; ++i) {
        is.add(static_cast<std::int64_t>(i * 10));
    }

    for (auto _ : state) {
        redisx::db::Dict dict;
        dict.expand(count);
        for (std::int64_t val : is.values()) {
            dict.insert_or_assign(std::to_string(val), redisx::db::Value(""));
        }
        benchmark::DoNotOptimize(dict.size());
    }
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(count));
}
BENCHMARK(BM_EncodingPromotion_IntsetToDict);

// Benchmark Workload Synthesis Throughput (ReadHeavy, WriteHeavy, Zipfian)
static void BM_WorkloadSynthesis_ReadHeavy(benchmark::State &state) {
    redisx::bench::WorkloadConfig cfg;
    cfg.key_count = 10000;
    redisx::bench::WorkloadGenerator gen(cfg);

    for (auto _ : state) {
        auto cmd = gen.next_command(redisx::bench::WorkloadType::ReadHeavy);
        benchmark::DoNotOptimize(cmd.size());
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_WorkloadSynthesis_ReadHeavy);

static void BM_WorkloadSynthesis_CacheZipfian(benchmark::State &state) {
    redisx::bench::WorkloadConfig cfg;
    cfg.key_count = 10000;
    redisx::bench::WorkloadGenerator gen(cfg);

    for (auto _ : state) {
        auto cmd = gen.next_command(redisx::bench::WorkloadType::CacheZipfian);
        benchmark::DoNotOptimize(cmd.size());
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_WorkloadSynthesis_CacheZipfian);

} // namespace

BENCHMARK_MAIN();
