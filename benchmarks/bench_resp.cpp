#include <benchmark/benchmark.h>
#include "redisx/core/buffer.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <string>

namespace {

// Benchmark RESP Multibulk Command Parsing (e.g. *2\r\n$3\r\nGET\r\n$7\r\nmykey01\r\n)
static void BM_RespParse_GetCommand(benchmark::State &state) {
    const std::string raw = "*2\r\n$3\r\nGET\r\n$8\r\nmy_key_1\r\n";
    redisx::core::Buffer in_buf;

    for (auto _ : state) {
        state.PauseTiming();
        in_buf.clear();
        in_buf.append(raw.data(), raw.size());
        state.ResumeTiming();

        auto res = redisx::proto::RespReader::parse(in_buf);
        benchmark::DoNotOptimize(res);
    }
    state.SetBytesProcessed(state.iterations() * static_cast<int64_t>(raw.size()));
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_RespParse_GetCommand);

// Benchmark RESP Multibulk Command with payload sizes (e.g. SET key <val>)
static void BM_RespParse_SetCommandPayload(benchmark::State &state) {
    const std::size_t val_size = static_cast<std::size_t>(state.range(0));
    std::string val(val_size, 'x');
    std::string raw = "*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$" +
                      std::to_string(val_size) + "\r\n" + val + "\r\n";

    redisx::core::Buffer in_buf;

    for (auto _ : state) {
        state.PauseTiming();
        in_buf.clear();
        in_buf.append(raw.data(), raw.size());
        state.ResumeTiming();

        auto res = redisx::proto::RespReader::parse(in_buf);
        benchmark::DoNotOptimize(res);
    }
    state.SetBytesProcessed(state.iterations() * static_cast<int64_t>(raw.size()));
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_RespParse_SetCommandPayload)->RangeMultiplier(4)->Range(64, 16384);

// Benchmark Pipelined RESP Command Parsing
static void BM_RespParse_PipelinedBatch(benchmark::State &state) {
    const std::size_t batch_size = static_cast<std::size_t>(state.range(0));
    const std::string single_cmd = "*2\r\n$3\r\nGET\r\n$5\r\nmykey\r\n";
    std::string raw;
    raw.reserve(single_cmd.size() * batch_size);
    for (std::size_t i = 0; i < batch_size; ++i) {
        raw += single_cmd;
    }

    redisx::core::Buffer in_buf;

    for (auto _ : state) {
        state.PauseTiming();
        in_buf.clear();
        in_buf.append(raw.data(), raw.size());
        state.ResumeTiming();

        while (in_buf.readable_bytes() > 0) {
            auto res = redisx::proto::RespReader::parse(in_buf);
            benchmark::DoNotOptimize(res);
            if (res.is_error() || !res.value().has_value()) {
                break;
            }
        }
    }
    state.SetBytesProcessed(state.iterations() * static_cast<int64_t>(raw.size()));
    state.SetItemsProcessed(state.iterations() * static_cast<int64_t>(batch_size));
}
BENCHMARK(BM_RespParse_PipelinedBatch)->RangeMultiplier(4)->Range(4, 64);

// Benchmark RESP Writer serialization throughput
static void BM_RespWriter_BulkString(benchmark::State &state) {
    const std::size_t val_size = static_cast<std::size_t>(state.range(0));
    const std::string payload(val_size, 'a');
    redisx::core::Buffer out_buf;

    for (auto _ : state) {
        out_buf.clear();
        redisx::proto::RespWriter::write_bulk_string(out_buf, payload);
        benchmark::DoNotOptimize(out_buf.readable_bytes());
    }
    state.SetBytesProcessed(state.iterations() * static_cast<int64_t>(out_buf.readable_bytes()));
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_RespWriter_BulkString)->RangeMultiplier(4)->Range(64, 16384);

} // namespace

BENCHMARK_MAIN();
