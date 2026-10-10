#ifndef REDISX_NET_IO_THREADS_H
#define REDISX_NET_IO_THREADS_H

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace redisx::net {

class Connection;

enum class IOThreadMode {
    Idle,
    ReadParse,
    SocketWrite
};

/**
 * @brief Threaded socket read/write and parsing engine.
 * 
 * Threading Model (Redis 6.0+ Architecture):
 * - Core database state execution (Keyspace, TTL, Eviction, Dict) remains strictly SINGLE-THREADED
 *   on the main event loop thread to preserve 100% ACID consistency and zero-lock overhead.
 * - IO threads perform ONLY:
 *   1. Parallel socket reading and RESP protocol decoding into Command structures.
 *   2. Parallel serialization and socket flushing of outgoing buffers.
 * - Barriers ensure that IO threads never touch connection buffers while the main thread
 *   is executing commands on the database keyspace.
 */
class IOThreadPool {
public:
    using ClientList = std::vector<std::shared_ptr<Connection>>;
    using TaskFn = std::function<void(std::shared_ptr<Connection>)>;

    explicit IOThreadPool(std::size_t thread_count = 0);
    ~IOThreadPool();

    IOThreadPool(const IOThreadPool &) = delete;
    IOThreadPool &operator=(const IOThreadPool &) = delete;

    void start();
    void stop();

    [[nodiscard]] std::size_t thread_count() const noexcept { return thread_count_; }
    [[nodiscard]] bool is_enabled() const noexcept { return thread_count_ > 0 && running_; }

    // Execute read/parse task across clients in parallel
    void parallel_read(const ClientList &clients, TaskFn read_fn);

    // Execute socket write task across clients in parallel
    void parallel_write(const ClientList &clients, TaskFn write_fn);

private:
    void worker_loop(std::size_t worker_id);

    std::size_t thread_count_{0};
    std::atomic<bool> running_{false};
    std::vector<std::thread> workers_;

    // Per-worker job assignment
    struct WorkerJob {
        std::mutex mtx;
        std::condition_variable cv;
        std::vector<std::shared_ptr<Connection>> clients;
        TaskFn task;
        bool has_work{false};
        bool done{false};
    };

    std::vector<std::unique_ptr<WorkerJob>> jobs_;
    std::mutex main_mtx_;
    std::condition_variable main_cv_;
};

} // namespace redisx::net

#endif // REDISX_NET_IO_THREADS_H
