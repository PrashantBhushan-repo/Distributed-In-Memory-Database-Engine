#include "bench/workloads.h"

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
    size_t clients = 20;
    size_t requests = 100000;
    size_t pipeline = 4;
    std::string workload_name = "read-heavy"; // read-heavy, write-heavy, cache, pipelined
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

void run_worker(const BenchConfig &cfg, size_t requests_per_client, std::vector<double> &latencies, size_t worker_id) {
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

    redisx::bench::WorkloadType wtype = redisx::bench::WorkloadType::ReadHeavy;
    if (cfg.workload_name == "write-heavy") {
        wtype = redisx::bench::WorkloadType::WriteHeavy;
    } else if (cfg.workload_name == "cache") {
        wtype = redisx::bench::WorkloadType::CacheZipfian;
    } else if (cfg.workload_name == "pipelined") {
        wtype = redisx::bench::WorkloadType::Pipelined;
    }

    redisx::bench::WorkloadConfig wcfg;
    wcfg.seed = 0xCAFEBABE1337ULL + worker_id * 10007ULL;
    redisx::bench::WorkloadGenerator gen(wcfg);

    size_t batches = requests_per_client / cfg.pipeline;
    std::vector<char> recv_buf(65536);

    for (size_t i = 0; i < batches; ++i) {
        std::string payload = gen.next_pipeline(wtype, cfg.pipeline);

        auto start = std::chrono::high_resolution_clock::now();
        send_bytes(sock, payload.data(), payload.size());

        // Drain reply
        ssize_t n = recv_bytes(sock, recv_buf.data(), recv_buf.size());
        auto finish = std::chrono::high_resolution_clock::now();

        if (n <= 0) break;

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
        else if (arg == "-w" && i + 1 < argc) cfg.workload_name = argv[++i];
    }

    std::cout << "========================================================\n"
              << " RedisX Workload-Aware Benchmark Harness (loadgen)\n"
              << " Target: " << cfg.host << ":" << cfg.port << "\n"
              << " Workload: " << cfg.workload_name << "\n"
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
        std::cerr << "[-] Error: Failed to collect benchmark metrics. Is RedisX running on "
                  << cfg.host << ":" << cfg.port << "?\n";
        return 1;
    }

    std::sort(all_lats.begin(), all_lats.end());
    double total_ops = static_cast<double>(all_lats.size() * cfg.pipeline);
    double qps = total_ops / total_sec;
    double avg_lat = std::accumulate(all_lats.begin(), all_lats.end(), 0.0) / static_cast<double>(all_lats.size());
    double min_lat = all_lats.front();
    double max_lat = all_lats.back();
    double p50 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.50)];
    double p95 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.95)];
    double p99 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.99)];
    double p999 = all_lats[static_cast<size_t>(static_cast<double>(all_lats.size()) * 0.999)];

    std::cout << std::fixed << std::setprecision(3)
              << "\nBenchmark Results (" << cfg.workload_name << "):\n"
              << "  Throughput:    " << std::setprecision(1) << qps << " req/sec\n"
              << "  Elapsed Time:  " << std::setprecision(2) << total_sec << " s\n"
              << "  Min Latency:   " << std::setprecision(3) << min_lat << " ms\n"
              << "  Avg Latency:   " << avg_lat << " ms\n"
              << "  p50 Latency:   " << p50 << " ms\n"
              << "  p95 Latency:   " << p95 << " ms\n"
              << "  p99 Latency:   " << p99 << " ms\n"
              << "  p99.9 Latency: " << p999 << " ms\n"
              << "  Max Latency:   " << max_lat << " ms\n"
              << "========================================================\n";

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
