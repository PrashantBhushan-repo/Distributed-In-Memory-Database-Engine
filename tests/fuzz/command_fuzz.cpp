#include "redisx/commands/dispatcher.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/commands/hash_cmds.h"
#include "redisx/commands/set_cmds.h"
#include "redisx/commands/zset_cmds.h"
#include "redisx/core/buffer.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/proto/resp_reader.h"

#include <cstddef>
#include <cstdint>

// LLVM libFuzzer entry point
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
    if (size == 0 || size > 512 * 1024) {
        return 0; // Skip empty or overly large inputs to prevent artificial OOM in fuzz engine
    }

    // Set up dispatcher and isolated keyspace
    static redisx::commands::Dispatcher dispatcher;
    static redisx::db::TTLManager ttl_mgr;
    static bool initialized = false;
    if (!initialized) {
        redisx::commands::register_string_commands(dispatcher, ttl_mgr);
        redisx::commands::register_list_commands(dispatcher);
        redisx::commands::register_hash_commands(dispatcher);
        redisx::commands::register_set_commands(dispatcher);
        redisx::commands::register_zset_commands(dispatcher);
        initialized = true;
    }

    redisx::db::Keyspace keyspace;
    redisx::core::Buffer in_buf;
    in_buf.append(data, size);

    // Bounded execution ticks to guarantee termination (no hang)
    size_t iterations = 0;
    constexpr size_t MAX_ITERATIONS = 500;

    while (in_buf.readable_bytes() > 0 && iterations++ < MAX_ITERATIONS) {
        auto res = redisx::proto::RespReader::parse(in_buf);
        if (res.is_error() || !res.value().has_value()) {
            break;
        }

        const auto &cmd = res.value().value();
        redisx::core::Buffer out_buf;
        std::size_t dirty = 0;

        // Dispatch through whole command path
        try {
            dispatcher.dispatch(cmd, keyspace, 0, out_buf, dirty);
        } catch (...) {
            // Memory allocation failures or exceptions must be caught cleanly without crash
        }
    }

    return 0;
}

#ifndef REDISX_BUILD_FUZZERS
// Standalone runner for unit/integration test harness execution without Clang libFuzzer
#include <gtest/gtest.h>
#include <random>
#include <vector>

TEST(CommandFuzzTest, WholePathRandomBytesRegression) {
    std::mt19937_64 rng(0x1337C0DE);
    std::uniform_int_distribution<uint16_t> byte_dist(0, 255);
    std::uniform_int_distribution<size_t> len_dist(1, 4096);

    for (int run = 0; run < 100; ++run) {
        size_t len = len_dist(rng);
        std::vector<uint8_t> payload(len);
        for (size_t i = 0; i < len; ++i) {
            payload[i] = static_cast<uint8_t>(byte_dist(rng));
        }
        std::cout << "[Fuzz] run=" << run << " len=" << len << std::endl;
        EXPECT_EQ(LLVMFuzzerTestOneInput(payload.data(), payload.size()), 0);
    }
}
#endif
