#include <algorithm>
#include <chrono>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t = SOCKET;
#define close_socket closesocket
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_t = int;
#define close_socket close
#endif

struct BenchConfig {
    std::string host = "127.0.0.1";
    int port = 6379;
    size_t clients = 10;
    size_t requests = 50000;
    size_t pipeline = 4;
};

static inline ssize_t send_bytes(socket_t sock, const void *buf, size_t len) {
#ifdef _WIN32
    return ::send(sock, static_cast<const char *>(buf), static_cast<int>(len), 0);
#else
    return ::send(sock, buf, len, 0);
#endif
}

static inline ssize_t recv_bytes(socket_t sock, void *buf, size_t len) {
#ifdef _WIN32
    return ::recv(sock, static_cast<char *>(buf), static_cast<int>(len), 0);
#else
    return ::recv(sock, buf, len, 0);
#endif
}

void run_worker(const BenchConfig &cfg, size_t requests_per_client, std::vector<double> &latencies, [[maybe_unused]] size_t worker_id) {
    socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return;

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<uint16_t>(cfg.port));
    inet_pton(AF_INET, cfg.host.c_str(), &addr.sin_addr);

    if (connect(sock, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) != 0) {
        close_socket(sock);
        return;
    }

    std::string pipeline_payload;
    for (size_t p = 0; p < cfg.pipeline; ++p) {
        std::string cmd = "*3\r\n$3\r\nSET\r\n$8\r\nload:key\r\n$3\r\nval\r\n";
        pipeline_payload += cmd;
    }

    size_t batches = requests_per_client / cfg.pipeline;
    std::vector<char> recv_buf(4096);

    for (size_t i = 0; i < batches; ++i) {
        auto start = std::chrono::high_resolution_clock::now();
        send_bytes(sock, pipeline_payload.data(), pipeline_payload.size());

        size_t bytes_needed = 5 * cfg.pipeline; // "+OK\r\n" is 5 bytes
        size_t bytes_read = 0;
        while (bytes_read < bytes_needed) {
            ssize_t n = recv_bytes(sock, recv_buf.data() + bytes_read, recv_buf.size() - bytes_read);
            if (n <= 0) break;
            bytes_read += static_cast<size_t>(n);
        }

        auto finish = std::chrono::high_resolution_clock::now();
        double lat_ms = std::chrono::duration<double, std::milli>(finish - start).count();
        latencies.push_back(lat_ms);
    }

    close_socket(sock);
}

int main(int argc, char **argv) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
#endif

    BenchConfig cfg;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "-h" && i + 1 < argc) cfg.host = argv[++i];
        else if (arg == "-p" && i + 1 < argc) cfg.port = std::stoi(argv[++i]);
        else if (arg == "-c" && i + 1 < argc) cfg.clients = static_cast<size_t>(std::max(1, std::stoi(argv[++i])));
        else if (arg == "-n" && i + 1 < argc) cfg.requests = static_cast<size_t>(std::max(1, std::stoi(argv[++i])));
        else if (arg == "-P" && i + 1 < argc) cfg.pipeline = static_cast<size_t>(std::max(1, std::stoi(argv[++i])));
    }

    std::cout << "========================================================\n"
              << " RedisX High-Performance Load Generator (loadgen)\n"
              << " Target: " << cfg.host << ":" << cfg.port << "\n"
              << " Concurrency: " << cfg.clients << " clients | Pipeline: " << cfg.pipeline << "\n"
              << " Total Requests: " << cfg.requests << "\n"
              << "========================================================\n";

    size_t reqs_per_client = cfg.requests / cfg.clients;
    std::vector<std::vector<double>> client_latencies(cfg.clients);
    std::vector<std::thread> workers;

    auto t0 = std::chrono::high_resolution_clock::now();

    for (size_t i = 0; i < cfg.clients; ++i) {
        workers.emplace_back(run_worker, std::cref(cfg), reqs_per_client, std::ref(client_latencies[i]), i);
    }

    for (auto &w : workers) {
        if (w.joinable()) w.join();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    double total_sec = std::chrono::duration<double>(t1 - t0).count();

    std::vector<double> all_lats;
    for (const auto &cl : client_latencies) {
        all_lats.insert(all_lats.end(), cl.begin(), cl.end());
    }

    if (all_lats.empty()) {
        std::cerr << "[-] Error: Failed to collect benchmark metrics. Is RedisX running?\n";
        return 1;
    }

    std::sort(all_lats.begin(), all_lats.end());
    double total_ops = static_cast<double>(all_lats.size() * cfg.pipeline);
    double qps = total_ops / total_sec;
    double p50 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.50)];
    double p90 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.90)];
    double p99 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.99)];

    std::cout << std::fixed << std::setprecision(2)
              << "\nResults:\n"
              << "  Throughput:  " << qps << " requests/sec\n"
              << "  Total Time:  " << total_sec << " seconds\n"
              << "  Latency p50: " << p50 << " ms\n"
              << "  Latency p90: " << p90 << " ms\n"
              << "  Latency p99: " << p99 << " ms\n"
              << "========================================================\n";

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
