#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/pubsub/pubsub.h"
#include "redisx/tx/transaction.h"
#include "redisx/tx/watch.h"

#include <gtest/gtest.h>

#include <memory>
#include <string>

#ifdef _WIN32
#include <winsock2.h>
#else
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace redisx::test {

class Stage9IntegrationTest : public ::testing::Test {
  protected:
    void SetUp() override {}
    void TearDown() override {}
};

TEST_F(Stage9IntegrationTest, WatchExecRaceWithSecondClient) {
    tx::WatchManager watch_mgr;
    tx::ClientTxState tx1;
    tx::ClientTxState tx2;

    watch_mgr.register_client_tx(1, &tx1);
    watch_mgr.register_client_tx(2, &tx2);

    // Client 1 watches key "mykey"
    watch_mgr.watch_key(1, 0, "mykey", tx1);

    // Client 2 modifies "mykey"
    watch_mgr.touch_key(0, "mykey");

    EXPECT_TRUE(tx1.dirty_cas);
    EXPECT_FALSE(tx2.dirty_cas);

    watch_mgr.unregister_client_tx(1);
    watch_mgr.unregister_client_tx(2);
}

TEST_F(Stage9IntegrationTest, PubSubPublishAndSubscribe) {
    pubsub::PubSubManager pubsub_mgr;
    net::EventLoop loop;

    int sv[2];
#ifdef _WIN32
    // Dummy socket test
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
    int test_fd = static_cast<int>(s);
#else
    int res = socketpair(AF_UNIX, SOCK_STREAM, 0, sv);
    (void)res;
    int test_fd = sv[0];
#endif

    auto conn = std::make_shared<net::Connection>(loop, test_fd);

    pubsub_mgr.subscribe(conn, "news");
    EXPECT_TRUE(pubsub_mgr.is_subscribed(test_fd));

    std::size_t count = pubsub_mgr.publish("news", "hello world");
    EXPECT_EQ(count, 1u);

    pubsub_mgr.unsubscribe(conn, "news");
    EXPECT_FALSE(pubsub_mgr.is_subscribed(test_fd));

#ifndef _WIN32
    close(sv[0]);
    close(sv[1]);
#endif
}

} // namespace redisx::test
