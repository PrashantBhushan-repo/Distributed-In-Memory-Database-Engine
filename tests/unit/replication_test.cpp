#include "redisx/replication/backlog.h"
#include "redisx/replication/repl_stream.h"
#include "redisx/replication/replid.h"
#include <gtest/gtest.h>

using namespace redisx::replication;

TEST(ReplicationUnitTest, ReplIdManagerBasic) {
    ReplIdManager id_mgr;
    EXPECT_EQ(id_mgr.master_replid().size(), 40u);
    EXPECT_EQ(id_mgr.master_repl_offset(), 0u);

    id_mgr.add_offset(100);
    EXPECT_EQ(id_mgr.master_repl_offset(), 100u);

    std::string old_id = id_mgr.master_replid();
    id_mgr.shift_replid("1234567890123456789012345678901234567890");

    EXPECT_EQ(id_mgr.master_replid(), "1234567890123456789012345678901234567890");
    EXPECT_EQ(id_mgr.replid2(), old_id);
    EXPECT_EQ(id_mgr.second_replid_offset(), 100);
}

TEST(ReplicationUnitTest, BacklogCircularWriteAndPartialResync) {
    ReplIdManager id_mgr;
    ReplBacklog backlog(100); // 100 byte capacity

    std::string data1 = "0123456789"; // 10 bytes
    backlog.write(data1, id_mgr);

    EXPECT_EQ(id_mgr.master_repl_offset(), 10u);
    EXPECT_EQ(backlog.first_byte_offset(), 1u);
    EXPECT_EQ(backlog.histlen(), 10u);

    EXPECT_TRUE(backlog.can_partial_resync(id_mgr.master_replid(), 1, id_mgr));
    EXPECT_TRUE(backlog.can_partial_resync(id_mgr.master_replid(), 5, id_mgr));
    EXPECT_TRUE(backlog.can_partial_resync(id_mgr.master_replid(), 11, id_mgr));
    EXPECT_FALSE(backlog.can_partial_resync("invalid_id", 1, id_mgr));

    std::string res = backlog.get_bytes_from_offset(1);
    EXPECT_EQ(res, "0123456789");

    std::string res_mid = backlog.get_bytes_from_offset(6);
    EXPECT_EQ(res_mid, "56789");

    // Overwrite circular buffer
    std::string data_large(120, 'A');
    backlog.write(data_large, id_mgr);

    EXPECT_EQ(id_mgr.master_repl_offset(), 130u);
    EXPECT_EQ(backlog.histlen(), 100u);
    EXPECT_FALSE(backlog.can_partial_resync(id_mgr.master_replid(), 1, id_mgr));
    EXPECT_TRUE(backlog.can_partial_resync(id_mgr.master_replid(), 31, id_mgr));
}

TEST(ReplicationUnitTest, DeterministicCommandRewriting) {
    ReplIdManager id_mgr;
    ReplBacklog backlog(1024);
    ReplStream stream(id_mgr, backlog);
    redisx::db::Keyspace keyspace;

    redisx::proto::Command cmd({"EXPIRE", "mykey", "10"});

    stream.propagate_command(cmd, keyspace, 0);

    EXPECT_GT(id_mgr.master_repl_offset(), 0u);
    std::string written = backlog.get_bytes_from_offset(1);
    EXPECT_NE(written.find("PEXPIREAT"), std::string::npos);
    EXPECT_NE(written.find("mykey"), std::string::npos);
}
