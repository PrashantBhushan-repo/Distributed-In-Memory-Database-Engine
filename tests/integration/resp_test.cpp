#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <gtest/gtest.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#define read_sock(fd, buf, len) ::recv(static_cast<SOCKET>(fd), static_cast<char*>(buf), static_cast<int>(len), 0)
#define write_sock(fd, buf, len) ::send(static_cast<SOCKET>(fd), reinterpret_cast<const char*>(buf), static_cast<int>(len), 0)
#define close_sock(fd) ::closesocket(static_cast<SOCKET>(fd))
using socket_ssize_t = int;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#define read_sock(fd, buf, len) ::read(fd, buf, len)
#define write_sock(fd, buf, len) ::write(fd, buf, len)
#define close_sock(fd) ::close(fd)
using socket_ssize_t = ssize_t;
#endif

#include <chrono>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace redisx::net;
using namespace redisx::proto;

class RespServerIntegrationTest : public ::testing::Test {
  protected:
    void SetUp() override {
        server_loop_ = std::make_unique<EventLoop>();
        listener_ = std::make_unique<Listener>(*server_loop_, "127.0.0.1", port_);

        listener_->set_new_connection_callback([](std::shared_ptr<Connection> conn) {
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
                std::string name = cmd.name_upper();

                if (name == "PING") {
                    if (cmd.arg_count() <= 1) {
                        RespWriter::write_simple_string(out_buf, "PONG");
                    } else {
                        RespWriter::write_bulk_string(out_buf, cmd.arg(1));
                    }
                } else if (name == "ECHO") {
                    if (cmd.arg_count() == 2) {
                        RespWriter::write_bulk_string(out_buf, cmd.arg(1));
                    } else {
                        RespWriter::write_error(out_buf, "ERR wrong number of arguments for 'echo' command");
                    }
                } else if (name == "COMMAND") {
                    RespWriter::write_command_docs(out_buf);
                } else {
                    std::string err = "ERR unknown command '" + name + "'";
                    if (cmd.arg_count() > 1) {
                        err += ", with args: ";
                        for (size_t i = 1; i < cmd.arg_count(); ++i) {
                            if (i > 1) {
                                err += ", ";
                            }
                            err += "'" + cmd.arg(i) + "'";
                        }
                    }
                    RespWriter::write_error(out_buf, err);
                }
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

    std::uint16_t port_{6481};
    std::unique_ptr<EventLoop> server_loop_;
    std::unique_ptr<Listener> listener_;
    std::thread server_thread_;
};

TEST_F(RespServerIntegrationTest, PingAndEchoRESP) {
    int sock = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
    ASSERT_GE(sock, 0);

    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port_);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

#ifdef _WIN32
    ASSERT_EQ(::connect(static_cast<SOCKET>(sock), reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);
#else
    ASSERT_EQ(::connect(sock, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr)), 0);
#endif

    // 1. Send RESP PING
    std::string ping_req = "*1\r\n$4\r\nPING\r\n";
    socket_ssize_t nwritten = write_sock(sock, ping_req.data(), ping_req.size());
    ASSERT_EQ(nwritten, static_cast<socket_ssize_t>(ping_req.size()));

    char buf[128] = {0};
    socket_ssize_t nread = read_sock(sock, buf, sizeof(buf) - 1);
    ASSERT_GT(nread, 0);
    EXPECT_EQ(std::string(buf, static_cast<size_t>(nread)), "+PONG\r\n");

    // 2. Send Inline ECHO
    std::string echo_req = "ECHO \"Hello RedisX\"\r\n";
    nwritten = write_sock(sock, echo_req.data(), echo_req.size());
    ASSERT_EQ(nwritten, static_cast<socket_ssize_t>(echo_req.size()));

    std::memset(buf, 0, sizeof(buf));
    nread = read_sock(sock, buf, sizeof(buf) - 1);
    ASSERT_GT(nread, 0);
    EXPECT_EQ(std::string(buf, static_cast<size_t>(nread)), "$12\r\nHello RedisX\r\n");

    // 3. Send Unknown Command
    std::string unknown_req = "*2\r\n$3\r\nFOO\r\n$3\r\nbar\r\n";
    nwritten = write_sock(sock, unknown_req.data(), unknown_req.size());
    ASSERT_EQ(nwritten, static_cast<socket_ssize_t>(unknown_req.size()));

    std::memset(buf, 0, sizeof(buf));
    nread = read_sock(sock, buf, sizeof(buf) - 1);
    ASSERT_GT(nread, 0);
    EXPECT_EQ(std::string(buf, static_cast<size_t>(nread)),
              "-ERR unknown command 'FOO', with args: 'bar'\r\n");

    close_sock(sock);
}
