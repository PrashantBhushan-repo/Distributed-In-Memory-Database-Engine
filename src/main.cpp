#include "redisx/core/logging.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/net/listener.h"

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

    REDISX_LOG_INFO("Starting RedisX server v0.1.0");

    redisx::net::EventLoop loop;
    g_loop = &loop;

    redisx::net::Listener listener(loop, host, port);

    // Stage 1 Echo Server handler
    listener.set_new_connection_callback([](std::shared_ptr<redisx::net::Connection> conn) {
        auto &in_buf = conn->in_buffer();
        size_t len = in_buf.readable_bytes();
        if (len > 0) {
            conn->send(in_buf.readable_data(), len);
            in_buf.consume(len);
        }
    });

    auto result = listener.start();
    if (result.is_error()) {
        REDISX_LOG_ERROR("Failed to start listener on %s:%u", host.c_str(), port);
        return 1;
    }

    REDISX_LOG_INFO("RedisX TCP echo server running on %s:%u", host.c_str(), port);
    loop.run();

    REDISX_LOG_INFO("RedisX server stopped cleanly.");
    return 0;
}