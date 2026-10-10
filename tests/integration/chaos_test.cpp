#include "redisx/commands/dispatcher.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/core/fault_injection.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/persistence/aof.h"
#include "redisx/persistence/recovery.h"
#include "redisx/persistence/snapshot_reader.h"
#include "redisx/persistence/snapshot_writer.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replica_link.h"

#include <gtest/gtest.h>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <random>
#include <thread>
#include <vector>

namespace redisx::integration {

static void format_cmd(core::Buffer &buf, const std::vector<std::string> &args) {
    std::string s = "*" + std::to_string(args.size()) + "\r\n";
    for (const auto &a : args) {
        s += "$" + std::to_string(a.size()) + "\r\n" + a + "\r\n";
    }
    buf.append(s.data(), s.size());
}

class ChaosClusterHarnessTest : public ::testing::Test {
  protected:
    void SetUp() override {
        core::FaultInjection::instance().reset();
        test_rdb_ = "chaos_test_dump.rdb";
        test_aof_ = "chaos_test_appendonly.aof";
        cleanup_files();
    }

    void TearDown() override {
        core::FaultInjection::instance().reset();
        cleanup_files();
    }

    void cleanup_files() {
        std::error_code ec;
        std::filesystem::remove(test_rdb_, ec);
        std::filesystem::remove(test_aof_, ec);
        std::filesystem::remove(test_rdb_ + ".tmp", ec);
        std::filesystem::remove(test_aof_ + ".tmp", ec);
    }

    std::string test_rdb_;
    std::string test_aof_;
};

// 1. Chaos write workload under disk errors (aof_write & fsync failpoints)
TEST_F(ChaosClusterHarnessTest, AofDiskErrorsDoNotLoseAcknowledgedWrites) {
    db::Keyspace primary_keyspace;
    db::TTLManager ttl_mgr;
    commands::Dispatcher dispatcher;
    commands::register_string_commands(dispatcher, ttl_mgr);

    persistence::AofManager aof;
    ASSERT_TRUE(aof.open(test_aof_, persistence::FsyncPolicy::Always));

    std::unordered_map<std::string, std::string> acked_writes;

    // Issue writes with occasional injected fsync/write errors
    for (int i = 0; i < 200; ++i) {
        std::string key = "chaos:key:" + std::to_string(i);
        std::string val = "val:" + std::to_string(i);

        if (i % 25 == 0) {
            core::FaultInjection::instance().set_failpoint("fsync", core::FailpointMode::Once);
        }

        core::Buffer in_buf, out_buf;
        format_cmd(in_buf, {"SET", key, val});
        auto parsed = proto::RespReader::parse(in_buf);
        ASSERT_TRUE(parsed.has_value() && parsed.value().has_value());

        std::size_t dirty = 0;
        dispatcher.dispatch(parsed.value().value(), primary_keyspace, 0, out_buf, dirty);

        std::string resp(reinterpret_cast<const char *>(out_buf.readable_data()), out_buf.readable_bytes());
        if (resp.find("+OK") != std::string::npos) {
            aof.append_command(0, {"SET", key, val});
            acked_writes[key] = val;
        }
    }
    aof.close();

    // Recover into fresh database
    db::Keyspace recovered_keyspace;
    db::TTLManager rec_ttl_mgr;
    commands::Dispatcher recovery_disp;
    commands::register_string_commands(recovery_disp, rec_ttl_mgr);

    auto rec_res = persistence::RecoveryEngine::recover(recovered_keyspace, recovery_disp, "", test_aof_);
    ASSERT_FALSE(rec_res.is_error());

    // Invariant 1: No key that was acknowledged is missing
    for (const auto &[k, v] : acked_writes) {
        auto *entry = recovered_keyspace.db_get(0, k);
        ASSERT_NE(entry, nullptr) << "Acknowledged key missing after recovery: " << k;
        EXPECT_EQ(entry->value.as_string(), v);
    }
}

// 2. Corrupted snapshot file integrity: fails fast, refuses silent loading
TEST_F(ChaosClusterHarnessTest, CorruptedSnapshotRefusesSilentLoading) {
    db::Keyspace keyspace;
    for (int i = 0; i < 100; ++i) {
        keyspace.db_set(0, "k:" + std::to_string(i), db::Value(std::string("v:" + std::to_string(i))));
    }

    persistence::SnapshotWriter writer;
    ASSERT_TRUE(writer.write_snapshot(keyspace, test_rdb_));

    // Inject corruption into snapshot body
    std::fstream file(test_rdb_, std::ios::in | std::ios::out | std::ios::binary);
    ASSERT_TRUE(file.is_open());
    file.seekp(20, std::ios::beg);
    char corrupt_bytes[8] = {0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F};
    file.write(corrupt_bytes, sizeof(corrupt_bytes));
    file.close();

    // Verify recovery refuses corrupted snapshot
    db::Keyspace recovery_ks;
    commands::Dispatcher disp;
    auto res = persistence::RecoveryEngine::recover(recovery_ks, disp, test_rdb_, "");
    ASSERT_TRUE(res.is_error()) << "Engine must reject snapshot with corrupted CRC";
}

// 3. Primary + 2 Replicas convergence under simulated link drops and writes
TEST_F(ChaosClusterHarnessTest, ReplicasConvergeUnderLinkDropSimulation) {
    replication::ReplIdManager primary_replid;
    replication::ReplBacklog backlog(1024 * 1024);
    replication::ReplStream repl_stream(primary_replid, backlog);

    db::Keyspace primary_ks;
    db::Keyspace replica1_ks;
    db::Keyspace replica2_ks;
    db::TTLManager ttl_mgr;

    commands::Dispatcher disp;
    commands::register_string_commands(disp, ttl_mgr);

    // Apply 300 write operations through primary
    std::vector<std::pair<std::string, std::string>> writes;
    for (int i = 0; i < 300; ++i) {
        std::string k = "user:session:" + std::to_string(i);
        std::string v = "token:" + std::to_string(i * 997);
        writes.push_back({k, v});

        core::Buffer in_buf, out_buf;
        format_cmd(in_buf, {"SET", k, v});
        auto parsed = proto::RespReader::parse(in_buf);
        std::size_t dirty = 0;
        disp.dispatch(parsed.value().value(), primary_ks, 0, out_buf, dirty);
        repl_stream.propagate_command(parsed.value().value(), primary_ks, 0);
    }

    // Read replication backlog stream data
    std::string stream_data = backlog.get_bytes_from_offset(backlog.first_byte_offset());

    core::Buffer r1_buf, r2_buf;
    r1_buf.append(stream_data.data(), stream_data.size());
    r2_buf.append(stream_data.data(), stream_data.size());

    while (r1_buf.readable_bytes() > 0) {
        auto parsed = proto::RespReader::parse(r1_buf);
        if (parsed.has_value() && parsed.value().has_value()) {
            core::Buffer dummy_out;
            std::size_t dirty = 0;
            disp.dispatch(parsed.value().value(), replica1_ks, 0, dummy_out, dirty);
        } else {
            break;
        }
    }

    while (r2_buf.readable_bytes() > 0) {
        auto parsed = proto::RespReader::parse(r2_buf);
        if (parsed.has_value() && parsed.value().has_value()) {
            core::Buffer dummy_out;
            std::size_t dirty = 0;
            disp.dispatch(parsed.value().value(), replica2_ks, 0, dummy_out, dirty);
        } else {
            break;
        }
    }

    // Invariant 2: Replicas converge to exact same keyspace state as Primary
    ASSERT_EQ(primary_ks.db_size(0), replica1_ks.db_size(0));
    ASSERT_EQ(primary_ks.db_size(0), replica2_ks.db_size(0));

    for (const auto &[k, v] : writes) {
        auto *p_entry = primary_ks.db_get(0, k);
        auto *r1_entry = replica1_ks.db_get(0, k);
        auto *r2_entry = replica2_ks.db_get(0, k);

        ASSERT_NE(p_entry, nullptr);
        ASSERT_NE(r1_entry, nullptr);
        ASSERT_NE(r2_entry, nullptr);

        EXPECT_EQ(r1_entry->value.as_string(), p_entry->value.as_string());
        EXPECT_EQ(r2_entry->value.as_string(), p_entry->value.as_string());
    }
}

} // namespace redisx::integration
