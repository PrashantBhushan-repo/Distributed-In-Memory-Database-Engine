#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/core/time.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <gtest/gtest.h>
#include <memory>
#include <string>

using namespace redisx;

class TTLTest : public ::testing::Test {
  protected:
    void SetUp() override {
        mock_time_ = std::make_shared<core::MockTimeProvider>(100000); // start at t = 100,000 ms
        ttl_mgr_ = std::make_unique<db::TTLManager>(mock_time_);
        commands::register_expire_commands(dispatcher_, *ttl_mgr_);
        commands::register_string_commands(dispatcher_, *ttl_mgr_);
    }

    void dispatch(const std::vector<std::string> &args, core::Buffer &out_buf) {
        proto::Command cmd(args);
        std::size_t out_db = active_db_;
        dispatcher_.dispatch(cmd, keyspace_, active_db_, out_buf, out_db);
        active_db_ = out_db;
    }

    std::shared_ptr<core::MockTimeProvider> mock_time_;
    std::unique_ptr<db::TTLManager> ttl_mgr_;
    db::Keyspace keyspace_;
    commands::Dispatcher dispatcher_;
    std::size_t active_db_{0};
};

TEST_F(TTLTest, LazyExpirationBasic) {
    keyspace_.db_set(0, "key1", db::Value("val1"));
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key1"), -1); // Persistent

    // Set expiration 1000ms into the future (at t = 101,000)
    EXPECT_TRUE(ttl_mgr_->set_expire_after(keyspace_, 0, "key1", 1000));
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key1"), 1000);
    EXPECT_EQ(ttl_mgr_->get_ttl_seconds(keyspace_, 0, "key1"), 1);

    // Advance time by 500ms (t = 100,500)
    mock_time_->advance_ms(500);
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key1"), 500);
    EXPECT_EQ(ttl_mgr_->get_ttl_seconds(keyspace_, 0, "key1"), 1);

    // Advance time by another 501ms (t = 101,001) - key expired
    mock_time_->advance_ms(501);
    EXPECT_TRUE(ttl_mgr_->expire_if_needed(keyspace_, 0, "key1"));
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key1"), -2);
    EXPECT_FALSE(keyspace_.db_exists(0, "key1"));
}

TEST_F(TTLTest, ExpireAndTTLCommands) {
    core::Buffer out;
    dispatch({"SET", "mykey", "hello"}, out);
    out.clear();

    // TTL of key before expire
    dispatch({"TTL", "mykey"}, out);
    EXPECT_EQ(out.peek_string_view(), ":-1\r\n");
    out.clear();

    // EXPIRE mykey 10
    dispatch({"EXPIRE", "mykey", "10"}, out);
    EXPECT_EQ(out.peek_string_view(), ":1\r\n");
    out.clear();

    dispatch({"TTL", "mykey"}, out);
    EXPECT_EQ(out.peek_string_view(), ":10\r\n");
    out.clear();

    dispatch({"PTTL", "mykey"}, out);
    EXPECT_EQ(out.peek_string_view(), ":10000\r\n");
    out.clear();

    // PERSIST mykey
    dispatch({"PERSIST", "mykey"}, out);
    EXPECT_EQ(out.peek_string_view(), ":1\r\n");
    out.clear();

    dispatch({"TTL", "mykey"}, out);
    EXPECT_EQ(out.peek_string_view(), ":-1\r\n");
    out.clear();
}

TEST_F(TTLTest, ExpireOptionsNX_XX_GT_LT) {
    core::Buffer out;
    dispatch({"SET", "k1", "v1"}, out);
    out.clear();

    // EXPIRE k1 10 XX -> fails (key has no TTL)
    dispatch({"EXPIRE", "k1", "10", "XX"}, out);
    EXPECT_EQ(out.peek_string_view(), ":0\r\n");
    out.clear();

    // EXPIRE k1 10 NX -> succeeds (key has no TTL)
    dispatch({"EXPIRE", "k1", "10", "NX"}, out);
    EXPECT_EQ(out.peek_string_view(), ":1\r\n");
    out.clear();

    // EXPIRE k1 20 NX -> fails (key already has TTL)
    dispatch({"EXPIRE", "k1", "20", "NX"}, out);
    EXPECT_EQ(out.peek_string_view(), ":0\r\n");
    out.clear();

    // EXPIRE k1 5 GT -> fails (5s < 10s)
    dispatch({"EXPIRE", "k1", "5", "GT"}, out);
    EXPECT_EQ(out.peek_string_view(), ":0\r\n");
    out.clear();

    // EXPIRE k1 20 GT -> succeeds (20s > 10s)
    dispatch({"EXPIRE", "k1", "20", "GT"}, out);
    EXPECT_EQ(out.peek_string_view(), ":1\r\n");
    out.clear();

    // EXPIRE k1 5 LT -> succeeds (5s < 20s)
    dispatch({"EXPIRE", "k1", "5", "LT"}, out);
    EXPECT_EQ(out.peek_string_view(), ":1\r\n");
    out.clear();
}

TEST_F(TTLTest, SetCommandTTLOptions) {
    core::Buffer out;

    // SET with EX
    dispatch({"SET", "key_ex", "val", "EX", "5"}, out);
    EXPECT_EQ(out.peek_string_view(), "+OK\r\n");
    out.clear();
    EXPECT_EQ(ttl_mgr_->get_ttl_seconds(keyspace_, 0, "key_ex"), 5);

    // SET with PX
    dispatch({"SET", "key_px", "val", "PX", "3000"}, out);
    EXPECT_EQ(out.peek_string_view(), "+OK\r\n");
    out.clear();
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key_px"), 3000);

    // Overwriting key without KEEPTTL clears TTL
    dispatch({"SET", "key_ex", "new_val"}, out);
    EXPECT_EQ(out.peek_string_view(), "+OK\r\n");
    out.clear();
    EXPECT_EQ(ttl_mgr_->get_ttl_seconds(keyspace_, 0, "key_ex"), -1);

    // Overwriting key WITH KEEPTTL keeps existing TTL
    dispatch({"SET", "key_px", "val2", "KEEPTTL"}, out);
    EXPECT_EQ(out.peek_string_view(), "+OK\r\n");
    out.clear();
    EXPECT_EQ(ttl_mgr_->get_ttl_ms(keyspace_, 0, "key_px"), 3000);
}

TEST_F(TTLTest, ActiveExpireCycle) {
    // Populate 50 keys with expiration 500ms
    for (int i = 0; i < 50; ++i) {
        keyspace_.db_set(0, "key_" + std::to_string(i), db::Value("val"));
        ttl_mgr_->set_expire_after(keyspace_, 0, "key_" + std::to_string(i), 500);
    }

    // Populate 50 keys without expiration
    for (int i = 50; i < 100; ++i) {
        keyspace_.db_set(0, "key_" + std::to_string(i), db::Value("val"));
    }

    // Before time advance, active expire cleans 0 keys
    std::size_t expired = ttl_mgr_->active_expire_cycle(keyspace_, 1);
    EXPECT_EQ(expired, 0u);

    // Advance time by 600ms
    mock_time_->advance_ms(600);

    // Active expire cycle runs and purges expired keys
    expired = ttl_mgr_->active_expire_cycle(keyspace_, 100);
    EXPECT_EQ(expired, 50u);
    EXPECT_EQ(keyspace_.db_size(0), 50u);
}

TEST_F(TTLTest, ReplicaModeBehavior) {
    keyspace_.db_set(0, "rep_key", db::Value("val"));
    ttl_mgr_->set_expire_after(keyspace_, 0, "rep_key", 100);
    ttl_mgr_->set_replica_mode(true);

    mock_time_->advance_ms(200); // Expired

    // In replica mode, expire_if_needed returns true but DOES NOT delete the key
    EXPECT_TRUE(ttl_mgr_->expire_if_needed(keyspace_, 0, "rep_key"));
    EXPECT_TRUE(keyspace_.db_exists(0, "rep_key")); // Key still in dict!

    // Active expire cycle does 0 work in replica mode
    std::size_t expired = ttl_mgr_->active_expire_cycle(keyspace_, 10);
    EXPECT_EQ(expired, 0u);
    EXPECT_TRUE(keyspace_.db_exists(0, "rep_key"));

    // GET command in replica mode returns nil bulk without deleting
    core::Buffer out;
    dispatch({"GET", "rep_key"}, out);
    EXPECT_EQ(out.peek_string_view(), "$-1\r\n");
    EXPECT_TRUE(keyspace_.db_exists(0, "rep_key"));
}
