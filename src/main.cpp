#include "redisx/core/logging.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <csignal>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>

static redisx::net::EventLoop *g_loop = nullptr;

static void signal_handler(int sig) {
    REDISX_LOG_INFO("Received signal %d, stopping server...", sig);
    if (g_loop) {
        g_loop->stop();
    }
}

static void print_help(const char *prog_name) {
    std::cout << "Usage: " << prog_name << " [OPTIONS]\n"
              << "Options:\n"
              << "  -p <port>         TCP port (default: 6379)\n"
              << "  -h <host>         Bind host IP (default: 127.0.0.1)\n"
              << "  --version         Output version information and exit\n"
              << "  --help            Output this help menu and exit\n";
}

int main(int argc, char *argv[]) {
    std::string host = "127.0.0.1";
    std::uint16_t port = 6379;

    for (int i = 1; i < argc; ++i) {
        std::string_view arg(argv[i]);
        if (arg == "--version") {
            std::cout << "redisx 0.1.0\n";
            return 0;
        }
        if (arg == "--help") {
            print_help(argv[0]);
            return 0;
        }
        if (arg == "-p" && i + 1 < argc) {
            port = static_cast<std::uint16_t>(std::atoi(argv[++i]));
        } else if (arg == "-h" && i + 1 < argc) {
            host = argv[++i];
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    REDISX_LOG_INFO("Starting RedisX server v0.1.0 (RESP2 Protocol Engine)");

    redisx::net::EventLoop loop;
    g_loop = &loop;

    redisx::net::Listener listener(loop, host, port);

    // RESP2 Command Dispatcher for Stage 2
    listener.set_new_connection_callback([](std::shared_ptr<redisx::net::Connection> conn) {
        auto &in_buf = conn->in_buffer();
        auto &out_buf = conn->out_buffer();

        while (in_buf.readable_bytes() > 0) {
            auto result = redisx::proto::RespReader::parse(in_buf);
            if (result.is_error()) {
                REDISX_LOG_WARN("Protocol error on fd %d, closing connection", conn->fd());
                redisx::proto::RespWriter::write_error(
                    out_buf, "ERR Protocol error: invalid multibulk length or format");
                conn->close();
                break;
            }

            if (!result.value().has_value()) {
                // Incomplete command, wait for more data
                break;
            }

            const auto &cmd = result.value().value();
            std::string cmd_name = cmd.name_upper();

            if (cmd_name == "PING") {
                if (cmd.arg_count() <= 1) {
                    redisx::proto::RespWriter::write_simple_string(out_buf, "PONG");
                } else {
                    redisx::proto::RespWriter::write_bulk_string(out_buf, cmd.arg(1));
                }
            } else if (cmd_name == "ECHO") {
                if (cmd.arg_count() == 2) {
                    redisx::proto::RespWriter::write_bulk_string(out_buf, cmd.arg(1));
                } else {
                    redisx::proto::RespWriter::write_error(
                        out_buf, "ERR wrong number of arguments for 'echo' command");
                }
            } else if (cmd_name == "COMMAND") {
                // Minimal reply for COMMAND / COMMAND DOCS to allow redis-cli to connect cleanly
                redisx::proto::RespWriter::write_command_docs(out_buf);
            } else {
                std::string err_msg = "ERR unknown command '" + cmd_name + "'";
                if (cmd.arg_count() > 1) {
                    err_msg += ", with args: ";
                    for (size_t i = 1; i < cmd.arg_count(); ++i) {
                        if (i > 1) {
                            err_msg += ", ";
                        }
                        err_msg += "'" + cmd.arg(i) + "'";
                    }
                }
                redisx::proto::RespWriter::write_error(out_buf, err_msg);
            }
        }
        conn->flush();
    });

    auto result = listener.start();
    if (result.is_error()) {
        REDISX_LOG_ERROR("Failed to start listener on %s:%u", host.c_str(), port);
        return 1;
    }

    REDISX_LOG_INFO("RedisX RESP2 server running on %s:%u", host.c_str(), port);
    loop.run();

    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}