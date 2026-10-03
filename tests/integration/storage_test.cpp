#include "redisx/commands/dispatcher.h"
#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <arpa/inet.h>
#include <gtest/gtest.h>
#include <netinet/in.h>
#include <sys/socket.h>

#include <chrono>
#include <cstring>
#include <memory>
#include <string>
#include <thread>

using namespace redisx::net;
using namespace redisx::proto;
using namespace redisx::commands;
using namespace redisx::db;

class StorageIntegrationTest : public ::testing::Test {
  protected:
    void SetUp() override {
        register_expire_commands(dispatcher_, ttl_mgr_);
        register_string_commands(dispatcher_, ttl_mgr_);

        server_loop_ = std::make_unique<EventLoop>();
        listener_ = std::make_unique<Listener>(*server_loop_, "127.0.0.1", port_);

        listener_->set_new_connection_callback([this](std::shared_ptr<Connection> conn) {
            auto &in_buf = conn->in_buffer();
            auto &out_buf = conn->out_buffer();

            while (in_buf.readable_bytes() > 0) {
                auto result = RespReader::parse(in_buf);
                if (result.is_error()) {
                    RespWriter::write_error(out_buf, "ERR Protocol error");
                    conn->close();
                    break;
                }
                if (!result.value().has_value()) {
                    break;
                }

                const auto &cmd = result.value().value();
                std::size_t conn_db_idx = active_db_idx_;

                dispatcher_.dispatch(cmd, keyspace_, conn_db_idx, out_buf, conn_db_idx);
                active_db_idx_ = conn_db_idx;
            }
            conn->flush();
        });

        ASSERT_TRUE(listener_->start().has_value());
        server_thread_ = std::thread([this]() { server_loop_->run(); });

        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    void TearDown() override {
        if (server_loop_) {
            server_loop_->stop();
        }
        if (server_thread_.joinable()) {
            server_thread_.join();
        }
        listener_->stop();
    }

    std::uint16_t port_{6482};
    std::unique_ptr<EventLoop> server_loop_;
    std::unique_ptr<Listener> listener_;
    std::thread server_thread_;
    TTLManager ttl_mgr_;
    Dispatcher dispatcher_;
    Keyspace keyspace_;
    std::size_t active_db_idx_{0};
};

TEST_F(StorageIntegrationTest, EndToEndSetGetIncr) {
    int sock = ::socket(AF_INET, SOCK_STREAM, 0);
    ASSERT_GE(sock, 0);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    ASSERT_EQ(::connect(sock, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);

    auto send_cmd = [sock](std::string_view req) {
        ssize_t nwritten = ::write(sock, req.data(), req.size());
        EXPECT_EQ(nwritten, static_cast<ssize_t>(req.size()));
    };

    auto recv_resp = [sock]() {
        char buf[256] = {0};
        ssize_t nread = ::read(sock, buf, sizeof(buf) - 1);
        EXPECT_GT(nread, 0);
        return std::string(buf, static_cast<size_t>(nread));
    };

    // 1. SET k1 v1
    send_cmd("*3\r\n$3\r\nSET\r\n$2\r\nk1\r\n$2\r\nv1\r\n");
    EXPECT_EQ(recv_resp(), "+OK\r\n");

    // 2. GET k1
    send_cmd("*2\r\n$3\r\nGET\r\n$2\r\nk1\r\n");
    EXPECT_EQ(recv_resp(), "$2\r\nv1\r\n");

    // 3. INCR counter
    send_cmd("*2\r\n$4\r\nINCR\r\n$7\r\ncounter\r\n");
    EXPECT_EQ(recv_resp(), ":1\r\n");

    // 4. INCRBY counter 5
    send_cmd("*3\r\n$6\r\nINCRBY\r\n$7\r\ncounter\r\n$1\r\n5\r\n");
    EXPECT_EQ(recv_resp(), ":6\r\n");

    // 5. EXISTS k1 counter
    send_cmd("*3\r\n$6\r\nEXISTS\r\n$2\r\nk1\r\n$7\r\ncounter\r\n");
    EXPECT_EQ(recv_resp(), ":2\r\n");

    // 5b. KEYS *
    send_cmd("*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n");
    std::string keys_resp = recv_resp();
    EXPECT_NE(keys_resp.find("counter"), std::string::npos);
    EXPECT_NE(keys_resp.find("k1"), std::string::npos);

    // 6. DEL k1
    send_cmd("*2\r\n$3\r\nDEL\r\n$2\r\nk1\r\n");
    EXPECT_EQ(recv_resp(), ":1\r\n");

    // 7. GET k1 (now deleted)
    send_cmd("*2\r\n$3\r\nGET\r\n$2\r\nk1\r\n");
    EXPECT_EQ(recv_resp(), "$-1\r\n");

    ::close(sock);
}
