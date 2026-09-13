#include "PBRedisDB/server/tcp_server.hpp"

#include "PBRedisDB/common/logger.hpp"

#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <netinet/in.h>
#include <stdexcept>
#include <sys/socket.h>
#include <unistd.h>

namespace PBRedisDB::server {

TcpServer::TcpServer(
    std::string host,
    std::uint16_t port
)
    : host_(std::move(host)),
      port_(port),
      server_fd_(-1) {
}

TcpServer::~TcpServer() {
    if (server_fd_ != -1) {
        ::close(server_fd_);
    }
}

void TcpServer::start() {

    server_fd_ = ::socket(
        AF_INET,
        SOCK_STREAM,
        0
    );

    if (server_fd_ == -1) {
        throw std::runtime_error(
            std::string("socket() failed: ") +
            std::strerror(errno)
        );
    }

    int reuse_address = 1;

    if (::setsockopt(
            server_fd_,
            SOL_SOCKET,
            SO_REUSEADDR,
            &reuse_address,
            sizeof(reuse_address)
        ) == -1) {

        throw std::runtime_error(
            std::string("setsockopt() failed: ") +
            std::strerror(errno)
        );
    }

    sockaddr_in server_address{};

    server_address.sin_family = AF_INET;
    server_address.sin_port = htons(port_);

    if (::inet_pton(
            AF_INET,
            host_.c_str(),
            &server_address.sin_addr
        ) <= 0) {

        throw std::runtime_error(
            "Invalid server address: " + host_
        );
    }

    if (::bind(
            server_fd_,
            reinterpret_cast<sockaddr*>(&server_address),
            sizeof(server_address)
        ) == -1) {

        throw std::runtime_error(
            std::string("bind() failed: ") +
            std::strerror(errno)
        );
    }

    if (::listen(server_fd_, SOMAXCONN) == -1) {

        throw std::runtime_error(
            std::string("listen() failed: ") +
            std::strerror(errno)
        );
    }

    common::info(
        "PBRedisDB TCP server started"
    );

    accept_connections();
}

void TcpServer::accept_connections() {

    while (true) {

        sockaddr_in client_address{};
        socklen_t client_address_length =
            sizeof(client_address);

        int client_fd = ::accept(
            server_fd_,
            reinterpret_cast<sockaddr*>(&client_address),
            &client_address_length
        );

        if (client_fd == -1) {

            if (errno == EINTR) {
                continue;
            }

            throw std::runtime_error(
                std::string("accept() failed: ") +
                std::strerror(errno)
            );
        }

        common::info(
            "Client connected"
        );

        const char response[] =
            "+OK PBRedisDB connected\r\n";

        const ssize_t bytes_written = ::send(
            client_fd,
            response,
            sizeof(response) - 1,
            0
        );

        if (bytes_written == -1) {
            common::warn(
                "Failed to send greeting to client"
            );
        }

        ::close(client_fd);

        common::info(
            "Client disconnected"
        );
    }
}

}  // namespace PBRedisDB::server