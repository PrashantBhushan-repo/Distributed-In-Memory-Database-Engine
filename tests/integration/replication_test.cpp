#include "redisx/commands/dispatcher.h"
#include "redisx/commands/repl_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/commands/hash_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/commands/set_cmds.h"
#include "redisx/commands/zset_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replica_link.h"
#include "redisx/replication/replid.h"
#include <gtest/gtest.h>

using namespace redisx;

TEST(ReplicationIntegrationTest, PrimaryReplicaStateConsistencyAndPartialResync) {
    db::Keyspace primary_keyspace;
    db::TTLManager primary_ttl;
    commands::Dispatcher primary_dispatcher;

    commands::register_string_commands(primary_dispatcher, primary_ttl);
    commands::register_hash_commands(primary_dispatcher);
    commands::register_list_commands(primary_dispatcher);
    commands::register_set_commands(primary_dispatcher);
    commands::register_zset_commands(primary_dispatcher);

    replication::ReplIdManager replid_mgr;
    replication::ReplBacklog backlog(1024 * 1024);
    replication::ReplStream repl_stream(replid_mgr, backlog);

    net::EventLoop loop;
    db::Keyspace replica_keyspace;
    db::TTLManager replica_ttl;
    commands::Dispatcher replica_dispatcher;

    commands::register_string_commands(replica_dispatcher, replica_ttl);
    commands::register_hash_commands(replica_dispatcher);
    commands::register_list_commands(replica_dispatcher);
    commands::register_set_commands(replica_dispatcher);
    commands::register_zset_commands(replica_dispatcher);

    replication::ReplicaLink replica_link(loop, replica_keyspace, replica_dispatcher, replica_ttl);

    commands::ReplicationContext repl_ctx{
        replid_mgr,
        backlog,
        repl_stream,
        replica_link,
        6379
    };
    commands::register_repl_commands(primary_dispatcher, repl_ctx);

    // 1. Populate primary keyspace with 500 mixed writes
    core::Buffer out_buf;
    std::size_t out_db = 0;

    for (int i = 0; i < 500; ++i) {
        proto::Command set_cmd({"SET", "key:" + std::to_string(i), "val:" + std::to_string(i)});
        primary_dispatcher.dispatch(set_cmd, primary_keyspace, 0, out_buf, out_db, nullptr, &primary_ttl);
        repl_stream.propagate_command(set_cmd, primary_keyspace, 0);

        proto::Command hset_cmd({"HSET", "hkey:" + std::to_string(i % 50), "field:" + std::to_string(i), "val:" + std::to_string(i)});
        primary_dispatcher.dispatch(hset_cmd, primary_keyspace, 0, out_buf, out_db, nullptr, &primary_ttl);
        repl_stream.propagate_command(hset_cmd, primary_keyspace, 0);
    }

    EXPECT_GT(replid_mgr.master_repl_offset(), 0u);
    EXPECT_EQ(primary_keyspace.db_size(0), 550u);

    // 2. Simulate PSYNC partial resync: stream backlog bytes to replica keyspace directly
    std::string stream_data = backlog.get_bytes_from_offset(1);
    core::Buffer stream_buf;
    stream_buf.append(stream_data.data(), stream_data.size());

    std::size_t active_db = 0;
    while (stream_buf.readable_bytes() > 0) {
        auto res = proto::RespReader::parse(stream_buf);
        if (res.is_error() || !res.value().has_value()) break;
        const auto &cmd = res.value().value();
        if (cmd.name_upper() == "SELECT" && cmd.arg_count() >= 2) {
            active_db = std::stoul(cmd.arg(1));
        } else {
            std::size_t db_out = active_db;
            core::Buffer dummy_out;
            replica_dispatcher.dispatch(cmd, replica_keyspace, active_db, dummy_out, db_out, nullptr, &replica_ttl);
            active_db = db_out;
        }
    }

    // Assert identical keyspace size & contents on replica
    EXPECT_EQ(replica_keyspace.db_size(0), primary_keyspace.db_size(0));

    for (int i = 0; i < 500; ++i) {
        auto pri_ent = primary_keyspace.db_get(0, "key:" + std::to_string(i));
        auto rep_ent = replica_keyspace.db_get(0, "key:" + std::to_string(i));
        ASSERT_NE(pri_ent, nullptr);
        ASSERT_NE(rep_ent, nullptr);
        EXPECT_EQ(pri_ent->value.as_string(), rep_ent->value.as_string());
    }

    // 3. Test Partial Resync (+CONTINUE) mid-stream after disconnecting and writing more
    std::uint64_t disconnect_offset = replid_mgr.master_repl_offset();

    for (int i = 500; i < 800; ++i) {
        proto::Command set_cmd({"SET", "key:" + std::to_string(i), "val:" + std::to_string(i)});
        primary_dispatcher.dispatch(set_cmd, primary_keyspace, 0, out_buf, out_db, nullptr, &primary_ttl);
        repl_stream.propagate_command(set_cmd, primary_keyspace, 0);
    }

    EXPECT_TRUE(backlog.can_partial_resync(replid_mgr.master_replid(), disconnect_offset + 1, replid_mgr));

    std::string gap_data = backlog.get_bytes_from_offset(disconnect_offset + 1);
    core::Buffer gap_buf;
    gap_buf.append(gap_data.data(), gap_data.size());

    while (gap_buf.readable_bytes() > 0) {
        auto res = proto::RespReader::parse(gap_buf);
        if (res.is_error() || !res.value().has_value()) break;
        const auto &cmd = res.value().value();
        std::size_t db_out = active_db;
        core::Buffer dummy_out;
        replica_dispatcher.dispatch(cmd, replica_keyspace, active_db, dummy_out, db_out, nullptr, &replica_ttl);
        active_db = db_out;
    }

    EXPECT_EQ(replica_keyspace.db_size(0), primary_keyspace.db_size(0));
    EXPECT_EQ(primary_keyspace.db_size(0), 850u);
}
