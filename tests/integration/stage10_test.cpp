#include "redisx/commands/admin_cmds.h"
#include "redisx/config/config.h"
#include "redisx/db/keyspace.h"
#include "redisx/memory/eviction.h"
#include "redisx/obs/info.h"
#include "redisx/obs/latency.h"
#include "redisx/obs/metrics.h"
#include "redisx/obs/slowlog.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/security/acl.h"
#include "redisx/security/auth.h"

#include <gtest/gtest.h>

#include <memory>
#include <string>

namespace redisx::test {

class Stage10IntegrationTest : public ::testing::Test {
  protected:
    void SetUp() override {}
    void TearDown() override {}
};

TEST_F(Stage10IntegrationTest, ConfigManagerGetSetRewrite) {
    config::ConfigManager config_mgr;
    std::string err_msg;

    auto res = config_mgr.config_get("maxmemory*");
    EXPECT_FALSE(res.empty());

    EXPECT_TRUE(config_mgr.config_set("maxmemory", "104857600", err_msg));
    EXPECT_EQ(config_mgr.get_int("maxmemory"), 104857600);

    // Test invalid value validation
    EXPECT_FALSE(config_mgr.config_set("maxmemory-policy", "invalid-policy-name", err_msg));

    // Test non-mutable parameter error
    EXPECT_FALSE(config_mgr.config_set("port", "6380", err_msg));
}

TEST_F(Stage10IntegrationTest, AuthEngineConstantTimeAuth) {
    security::AuthEngine auth_engine;
    EXPECT_FALSE(auth_engine.is_auth_required());

    auth_engine.set_requirepass("secret_pass_123");
    EXPECT_TRUE(auth_engine.is_auth_required());

    EXPECT_TRUE(auth_engine.authenticate("secret_pass_123"));
    EXPECT_FALSE(auth_engine.authenticate("wrong_pass"));

    EXPECT_TRUE(auth_engine.is_command_allowed_unauthenticated("AUTH"));
    EXPECT_TRUE(auth_engine.is_command_allowed_unauthenticated("HELLO"));
    EXPECT_FALSE(auth_engine.is_command_allowed_unauthenticated("SET"));
}

TEST_F(Stage10IntegrationTest, AclEngineUserPermissions) {
    security::AclEngine acl_engine;
    std::string err_msg;

    // Create user alice with read-only access and password secret
    std::vector<std::string> rules = {"on", ">secretpass", "+@read", "-@dangerous", "~cache:*"};
    EXPECT_TRUE(acl_engine.set_user_rules("alice", rules, err_msg));

    const auto *user = acl_engine.get_user("alice");
    ASSERT_NE(user, nullptr);
    EXPECT_TRUE(user->enabled);

    commands::Dispatcher dispatcher;
    commands::CommandSpec get_spec{"GET", 2, commands::CMD_FLAG_READONLY, nullptr};
    proto::Command get_cmd({"GET", "cache:123"});
    EXPECT_TRUE(acl_engine.check_permission(*user, get_cmd, &get_spec));

    commands::CommandSpec flushall_spec{"FLUSHALL", 1, commands::CMD_FLAG_ADMIN, nullptr};
    proto::Command flushall_cmd({"FLUSHALL"});
    EXPECT_FALSE(acl_engine.check_permission(*user, flushall_cmd, &flushall_spec));
}

TEST_F(Stage10IntegrationTest, ObservabilityInfoProvider) {
    net::EventLoop loop;
    db::Keyspace keyspace;
    db::TTLManager ttl_mgr;
    commands::Dispatcher dispatcher;
    replication::ReplIdManager replid_mgr;
    replication::ReplBacklog backlog(1024 * 1024);
    replication::ReplStream repl_stream(replid_mgr, backlog);
    replication::ReplicaLink replica_link(loop, keyspace, dispatcher, ttl_mgr);

    commands::ReplicationContext repl_ctx{
        replid_mgr,
        backlog,
        repl_stream,
        replica_link,
        6379
    };

    memory::EvictionManager evict_mgr;
    config::ConfigManager config_mgr;
    obs::ServerStats stats;

    std::string info_all = obs::InfoProvider::generate_info("all", keyspace, evict_mgr, repl_ctx, config_mgr, stats, 1, 0);
    EXPECT_NE(info_all.find("# Server"), std::string::npos);
    EXPECT_NE(info_all.find("# Clients"), std::string::npos);
    EXPECT_NE(info_all.find("# Memory"), std::string::npos);
    EXPECT_NE(info_all.find("# Stats"), std::string::npos);
}

TEST_F(Stage10IntegrationTest, SlowlogAndLatencyMonitoring) {
    obs::SlowlogManager slowlog_mgr;
    proto::Command cmd({"GET", "mykey"});
    slowlog_mgr.log_command(cmd, 15000, 10000, 128);

    EXPECT_EQ(slowlog_mgr.len(), 1u);
    auto entries = slowlog_mgr.get_entries();
    ASSERT_EQ(entries.size(), 1u);
    EXPECT_EQ(entries[0].duration_us, 15000u);

    obs::LatencyMonitor latency_mon;
    latency_mon.record_latency("command", 25);
    auto latest = latency_mon.get_latest();
    EXPECT_EQ(latest["command"].latency_ms, 25u);
    EXPECT_NE(latency_mon.doctor_report().find("latency"), std::string::npos);
}

TEST_F(Stage10IntegrationTest, PrometheusExporter) {
    net::EventLoop loop;
    db::Keyspace keyspace;
    db::TTLManager ttl_mgr;
    commands::Dispatcher dispatcher;
    replication::ReplIdManager replid_mgr;
    replication::ReplBacklog backlog(1024 * 1024);
    replication::ReplStream repl_stream(replid_mgr, backlog);
    replication::ReplicaLink replica_link(loop, keyspace, dispatcher, ttl_mgr);

    commands::ReplicationContext repl_ctx{
        replid_mgr,
        backlog,
        repl_stream,
        replica_link,
        6379
    };

    memory::EvictionManager evict_mgr;
    obs::ServerStats stats;

    std::string metrics = obs::PrometheusExporter::generate_metrics(keyspace, evict_mgr, repl_ctx, stats, 2);
    EXPECT_NE(metrics.find("redis_uptime_in_seconds"), std::string::npos);
    EXPECT_NE(metrics.find("redis_connected_clients 2"), std::string::npos);
}

TEST_F(Stage10IntegrationTest, AdminCommandsRegistration) {
    commands::Dispatcher dispatcher;
    std::unordered_map<int, std::shared_ptr<net::Connection>> active_clients;

    commands::register_admin_commands(dispatcher, active_clients);

    const auto *client_spec = dispatcher.find_command("CLIENT");
    ASSERT_NE(client_spec, nullptr);

    const auto *hello_spec = dispatcher.find_command("HELLO");
    ASSERT_NE(hello_spec, nullptr);
}

} // namespace redisx::test
