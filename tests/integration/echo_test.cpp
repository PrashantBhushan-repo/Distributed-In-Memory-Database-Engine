#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"

#include <arpa/inet.h>
#include <gtest/gtest.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <vector>
#include <atomic>
#include <chrono>

using namespace redisx::net;

class EchoServerIntegrationTest : public ::testing::Test {
  protected:
    void SetUp() override {
        server_loop_ = std::make_unique<EventLoop>();
        listener_ = std::make_unique<Listener>(*server_loop_, "127.0.0.1", port_);

        listener_->set_new_connection_callback([](std::shared_ptr<Connection> conn) {
            auto &in_buf = conn->in_buffer();
            size_t len = in_buf.readable_bytes();
            if (len > 0) {
                conn->send(in_buf.readable_data(), len);
                in_buf.consume(len);
            }
        });

        ASSERT_TRUE(listener_->start().has_value());

        server_thread_ = std::thread([this]() {
            server_loop_->run();
        });

        // Give server thread time to start listening
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

    std::uint16_t port_{6480};
    std::unique_ptr<EventLoop> server_loop_;
    std::unique_ptr<Listener> listener_;
    std::thread server_thread_;
};

TEST_F(EchoServerIntegrationTest, SingleConnectionEcho) {
    int sock = ::socket(AF_INET, SOCK_STREAM, 0);
    ASSERT_GE(sock, 0);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    ASSERT_EQ(::connect(sock, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);

    std::string msg = "PING PONG REDISX TEST";
    ssize_t nwritten = ::write(sock, msg.data(), msg.size());
    ASSERT_EQ(nwritten, static_cast<ssize_t>(msg.size()));

    char buf[128] = {0};
    ssize_t nread = ::read(sock, buf, sizeof(buf) - 1);
    ASSERT_EQ(nread, static_cast<ssize_t>(msg.size()));
    EXPECT_STREQ(buf, msg.c_str());

    ::close(sock);
}

TEST_F(EchoServerIntegrationTest, ConcurrentClientsEcho) {
    constexpr size_t NUM_CLIENTS = 100;
    std::vector<int> sockets(NUM_CLIENTS, -1);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    // Open NUM_CLIENTS connections
    for (size_t i = 0; i < NUM_CLIENTS; ++i) {
        sockets[i] = ::socket(AF_INET, SOCK_STREAM, 0);
        ASSERT_GE(sockets[i], 0);
        ASSERT_EQ(::connect(sockets[i], reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);
    }

    // Send payload concurrently across all clients
    for (size_t i = 0; i < NUM_CLIENTS; ++i) {
        std::string payload = "ClientPayload_" + std::to_string(i);
        ssize_t nwritten = ::write(sockets[i], payload.data(), payload.size());
        EXPECT_EQ(nwritten, static_cast<ssize_t>(payload.size()));
    }

    // Read and verify echo from all clients
    for (size_t i = 0; i < NUM_CLIENTS; ++i) {
        std::string expected = "ClientPayload_" + std::to_string(i);
        char buf[128] = {0};
        ssize_t nread = ::read(sockets[i], buf, sizeof(buf) - 1);
        EXPECT_EQ(nread, static_cast<ssize_t>(expected.size()));
        EXPECT_EQ(std::string(buf, static_cast<size_t>(nread)), expected);
        ::close(sockets[i]);
    }
}

TEST_F(EchoServerIntegrationTest, MaxClientsEnforcement) {
    listener_->set_max_clients(5);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    std::vector<int> valid_socks;
    for (int i = 0; i < 5; ++i) {
        int s = ::socket(AF_INET, SOCK_STREAM, 0);
        ASSERT_GE(s, 0);
        ASSERT_EQ(::connect(s, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);
        valid_socks.push_back(s);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(20));

    // The 6th connection attempt should be rejected with max clients error
    int overflow_sock = ::socket(AF_INET, SOCK_STREAM, 0);
    ASSERT_GE(overflow_sock, 0);
    ASSERT_EQ(::connect(overflow_sock, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);

    char buf[128] = {0};
    ssize_t nread = ::read(overflow_sock, buf, sizeof(buf) - 1);
    EXPECT_GT(nread, 0);
    EXPECT_NE(std::string(buf).find("max number of clients reached"), std::string::npos);

    ::close(overflow_sock);
    for (int s : valid_socks) {
        ::close(s);
    }
}
