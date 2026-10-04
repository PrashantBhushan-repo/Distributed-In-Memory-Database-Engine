#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/memory_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/memory/accounting.h"
#include "redisx/memory/eviction.h"
#include "redisx/proto/command.h"
#include <gtest/gtest.h>

TEST(EvictionTest, NoEvictionReturnsOOM) {
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::memory::EvictionManager evict_mgr;
    redisx::commands::Dispatcher dispatcher;

    redisx::commands::register_string_commands(dispatcher, ttl_mgr);
    redisx::commands::register_memory_commands(dispatcher, evict_mgr);

    // Set maxmemory to 100 bytes and policy to NoEviction
    evict_mgr.set_maxmemory(100);
    evict_mgr.set_policy(redisx::memory::EvictionPolicy::NoEviction);
    redisx::memory::MemoryTracker::instance().set_maxmemory(100);
    redisx::memory::MemoryTracker::instance().alloc(150); // Artificially exceed maxmemory

    redisx::core::Buffer out;
    std::size_t active_db = 0;
    std::size_t out_db = 0;

    redisx::proto::Command set_cmd({"SET", "k1", "v1"});

    dispatcher.dispatch(set_cmd, keyspace, active_db, out, out_db, &evict_mgr, &ttl_mgr);

    std::string response(reinterpret_cast<const char*>(out.readable_data()), out.readable_bytes());
    EXPECT_NE(response.find("OOM command not allowed"), std::string::npos);

    redisx::memory::MemoryTracker::instance().reset();
}

TEST(EvictionTest, SampledLRUEviction) {
    redisx::db::Keyspace keyspace;
    redisx::db::TTLManager ttl_mgr;
    redisx::memory::EvictionManager evict_mgr;
    redisx::commands::Dispatcher dispatcher;

    redisx::commands::register_string_commands(dispatcher, ttl_mgr);

    evict_mgr.set_maxmemory(200);
    evict_mgr.set_policy(redisx::memory::EvictionPolicy::AllKeysLRU);

    // Add keys to database
    for (int i = 0; i < 20; ++i) {
        keyspace.db_set(0, "key_" + std::to_string(i), redisx::db::Value("value_" + std::to_string(i)));
    }
    redisx::memory::MemoryTracker::instance().alloc(500);

    // Trigger eviction
    bool res = evict_mgr.perform_eviction(keyspace, ttl_mgr);
    EXPECT_TRUE(res);
    EXPECT_GT(evict_mgr.evicted_keys(), 0);

    redisx::memory::MemoryTracker::instance().reset();
}
