#include "PBRedisDB/server/tcp_server.hpp"

#include "PBRedisDB/common/logger.hpp"

#include <cstdint>
#include <exception>

int main() {

    try {

        constexpr std::uint16_t port = 6379;

        PBRedisDB::server::TcpServer server(
            "127.0.0.1",
            port
        );

        server.start();

    } catch (const std::exception& exception) {

        PBRedisDB::common::error(
            exception.what()
        );

        return 1;
    }

    return 0;
}