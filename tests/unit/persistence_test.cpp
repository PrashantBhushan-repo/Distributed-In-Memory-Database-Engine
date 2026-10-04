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

class PersistenceTest : public ::testing::Test {
  protected:
    void SetUp() override {
        std::filesystem::remove("test_dump.rdb");
        std::filesystem::remove("test_dump.rdb.tmp");
        std::filesystem::remove("test_append.aof");
        std::filesystem::remove("test_append.aof.tmp");
    }

    void TearDown() override {
        std::filesystem::remove("test_dump.rdb");
        std::filesystem::remove("test_dump.rdb.tmp");
        std::filesystem::remove("test_append.aof");
        std::filesystem::remove("test_append.aof.tmp");
    }
};

TEST_F(PersistenceTest, RdbRoundtripAllTypes) {
    db::Keyspace src_ks;

    // String
    src_ks.db_set(0, "str_key", db::Value(types::Object("hello_world")));

    // List
    auto list_obj = types::Object::create_list();
    list_obj.list_push_back("item1");
    list_obj.list_push_back("item2");
    src_ks.db_set(0, "list_key", db::Value(std::move(list_obj)));

    // Hash
    auto hash_obj = types::Object::create_hash();
    hash_obj.hash_set("field1", "val1");
    hash_obj.hash_set("field2", "val2");
    src_ks.db_set(0, "hash_key", db::Value(std::move(hash_obj)));

    // Set
    auto set_obj = types::Object::create_set();
    set_obj.set_add("m1");
    set_obj.set_add("m2");
    src_ks.db_set(0, "set_key", db::Value(std::move(set_obj)));

    // ZSet
    auto zset_obj = types::Object::create_zset();
    zset_obj.zset_add(10.5, "zm1");
    zset_obj.zset_add(20.0, "zm2");
    src_ks.db_set(0, "zset_key", db::Value(std::move(zset_obj)));

    // Save
    persistence::SnapshotWriter writer;
    ASSERT_TRUE(writer.write_snapshot(src_ks, "test_dump.rdb"));

    // Load
    db::Keyspace dst_ks;
    persistence::SnapshotReader reader;
    auto res = reader.load_snapshot(dst_ks, "test_dump.rdb");
    ASSERT_FALSE(res.is_error());

    // Verify
    auto *str_entry = dst_ks.db_get(0, "str_key");
    ASSERT_NE(str_entry, nullptr);
    EXPECT_EQ(str_entry->value.as_string(), "hello_world");

    auto *list_entry = dst_ks.db_get(0, "list_key");
    ASSERT_NE(list_entry, nullptr);
    EXPECT_EQ(list_entry->value.object().list_len(), 2u);

    auto *hash_entry = dst_ks.db_get(0, "hash_key");
    ASSERT_NE(hash_entry, nullptr);
    EXPECT_EQ(hash_entry->value.object().hash_get("field1").value_or(""), "val1");

    auto *set_entry = dst_ks.db_get(0, "set_key");
    ASSERT_NE(set_entry, nullptr);
    EXPECT_TRUE(set_entry->value.object().set_contains("m1"));

    auto *zset_entry = dst_ks.db_get(0, "zset_key");
    ASSERT_NE(zset_entry, nullptr);
    EXPECT_EQ(zset_entry->value.object().zset_score("zm1").value_or(0.0), 10.5);
}

TEST_F(PersistenceTest, RdbCrcMismatchDetection) {
    db::Keyspace ks;
    ks.db_set(0, "k1", db::Value(types::Object("v1")));

    persistence::SnapshotWriter writer;
    ASSERT_TRUE(writer.write_snapshot(ks, "test_dump.rdb"));

    // Corrupt one byte mid-file
    std::fstream f("test_dump.rdb", std::ios::in | std::ios::out | std::ios::binary);
    f.seekp(12);
    f.put(0x7F);
    f.close();

    db::Keyspace dst_ks;
    persistence::SnapshotReader reader;
    auto res = reader.load_snapshot(dst_ks, "test_dump.rdb");
    EXPECT_TRUE(res.is_error());
}

TEST_F(PersistenceTest, AofRewriteAndRecovery) {
    db::Keyspace ks;
    ks.db_set(0, "aof_key", db::Value(types::Object("aof_val")));

    persistence::AofManager aof;
    ASSERT_TRUE(aof.open("test_append.aof", persistence::FsyncPolicy::No));
    aof.append_command(0, {"SET", "aof_key", "aof_val"});
    aof.close();

    db::Keyspace dst_ks;
    db::TTLManager ttl_mgr;
    commands::Dispatcher dispatcher;
    commands::register_string_commands(dispatcher, ttl_mgr);

    auto res = persistence::RecoveryEngine::recover(dst_ks, dispatcher, "", "test_append.aof");
    ASSERT_FALSE(res.is_error());

    auto *entry = dst_ks.db_get(0, "aof_key");
    ASSERT_NE(entry, nullptr);
    EXPECT_EQ(entry->value.as_string(), "aof_val");
}
