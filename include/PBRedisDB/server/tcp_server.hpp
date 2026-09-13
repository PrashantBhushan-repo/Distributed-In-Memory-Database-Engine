#pragma once

#include <cstdint>
#include <string>

namespace PBRedisDB::server {

class TcpServer {
public:
	TcpServer(
		std::string host,
		std::uint16_t port
	);

	TcpServer(const TcpServer&) = delete;
	TcpServer& operator=(const TcpServer&) = delete;

	~TcpServer();

	void start();

private:
	void accept_connections();

	std::string host_;
	std::uint16_t port_;

	int server_fd_;
};

}  // namespace PBRedisDB::server
