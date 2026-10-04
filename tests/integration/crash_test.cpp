#include "redisx/persistence/snapshot_writer.h"
#include "redisx/persistence/snapshot_reader.h"
#include "redisx/persistence/aof.h"
#include "redisx/persistence/recovery.h"
#include "redisx/commands/dispatcher.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"

#include <gtest/gtest.h>
#include <filesystem>
#include <fstream>
#include <utility>

using namespace redisx;

class CrashTest : public ::testing::Test {
  protected:
    void SetUp() override {
        std::filesystem::remove("crash_dump.rdb");
        std::filesystem::remove("crash_append.aof");
    }

    void TearDown() override {
        std::filesystem::remove("crash_dump.rdb");
        std::filesystem::remove("crash_append.aof");
    }
};

TEST_F(CrashTest, TruncatedAofRecovery) {
    // Write valid commands + truncated command tail
    std::ofstream aof("crash_append.aof", std::ios::binary);
    std::string valid_cmd = "*3\r\n$3\r\nSET\r\n$2\r\nk1\r\n$2\r\nv1\r\n";
    std::string truncated_tail = "*3\r\n$3\r\nSET\r\n$2\r\nk2\r\n$2\r\n"; // Cut off halfway
    aof << valid_cmd << truncated_tail;
    aof.close();

    db::Keyspace ks;
    db::TTLManager ttl_mgr;
    commands::Dispatcher dispatcher;
    commands::register_string_commands(dispatcher, ttl_mgr);

    persistence::RecoveryOptions opts;
    opts.aof_load_truncated = true;

    auto res = persistence::RecoveryEngine::recover(ks, dispatcher, "", "crash_append.aof", opts);
    ASSERT_FALSE(res.is_error());

    auto *k1 = ks.db_get(0, "k1");
    ASSERT_NE(k1, nullptr);
    EXPECT_EQ(k1->value.as_string(), "v1");

    auto *k2 = ks.db_get(0, "k2");
    EXPECT_EQ(k2, nullptr);
}

TEST_F(CrashTest, CorruptedRdbRefusesStartup) {
    db::Keyspace src_ks;
    src_ks.db_set(0, "key1", db::Value(types::Object("value1")));

    persistence::SnapshotWriter writer;
    ASSERT_TRUE(writer.write_snapshot(src_ks, "crash_dump.rdb"));

    // Flip random byte in file
    std::fstream f("crash_dump.rdb", std::ios::in | std::ios::out | std::ios::binary);
    f.seekp(15);
    f.put(0xFF);
    f.close();

    db::Keyspace dst_ks;
    commands::Dispatcher dispatcher;

    auto res = persistence::RecoveryEngine::recover(dst_ks, dispatcher, "crash_dump.rdb", "");
    EXPECT_TRUE(res.is_error());
}
