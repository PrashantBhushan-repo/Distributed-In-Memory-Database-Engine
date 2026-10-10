#include "redisx/net/io_threads.h"
#include "redisx/net/connection.h"

namespace redisx::net {

IOThreadPool::IOThreadPool(std::size_t thread_count)
    : thread_count_(thread_count) {
    if (thread_count_ > 0) {
        jobs_.reserve(thread_count_);
        for (std::size_t i = 0; i < thread_count_; ++i) {
            jobs_.push_back(std::make_unique<WorkerJob>());
        }
    }
}

IOThreadPool::~IOThreadPool() {
    stop();
}

void IOThreadPool::start() {
    if (thread_count_ == 0 || running_) {
        return;
    }
    running_ = true;

    workers_.reserve(thread_count_);
    for (std::size_t i = 0; i < thread_count_; ++i) {
        workers_.emplace_back(&IOThreadPool::worker_loop, this, i);
    }
}

void IOThreadPool::stop() {
    if (!running_) {
        return;
    }
    running_ = false;

    for (std::size_t i = 0; i < thread_count_; ++i) {
        {
            std::lock_guard<std::mutex> lock(jobs_[i]->mtx);
            jobs_[i]->has_work = true;
        }
        jobs_[i]->cv.notify_one();
    }

    for (auto &t : workers_) {
        if (t.joinable()) {
            t.join();
        }
    }
    workers_.clear();
}

void IOThreadPool::worker_loop(std::size_t worker_id) {
    auto &job = *jobs_[worker_id];

    while (running_) {
        std::vector<std::shared_ptr<Connection>> local_clients;
        TaskFn local_task;

        {
            std::unique_lock<std::mutex> lock(job.mtx);
            job.cv.wait(lock, [&]() { return job.has_work || !running_; });

            if (!running_) {
                break;
            }

            local_clients = std::move(job.clients);
            local_task = std::move(job.task);
            job.has_work = false;
        }

        // Execute batch of connection read/write tasks
        if (local_task) {
            for (auto &client : local_clients) {
                if (client) {
                    local_task(client);
                }
            }
        }

        // Notify main thread that this worker is done
        {
            std::lock_guard<std::mutex> lock(main_mtx_);
            job.done = true;
        }
        main_cv_.notify_one();
    }
}

void IOThreadPool::parallel_read(const ClientList &clients, TaskFn read_fn) {
    if (!is_enabled() || clients.empty()) {
        for (const auto &c : clients) {
            if (c) read_fn(c);
        }
        return;
    }

    // Partition clients across available worker threads round-robin
    for (std::size_t i = 0; i < thread_count_; ++i) {
        std::lock_guard<std::mutex> lock(jobs_[i]->mtx);
        jobs_[i]->clients.clear();
        jobs_[i]->task = read_fn;
        jobs_[i]->done = false;
    }

    for (std::size_t i = 0; i < clients.size(); ++i) {
        std::size_t target = i % thread_count_;
        jobs_[target]->clients.push_back(clients[i]);
    }

    // Kick off workers
    for (std::size_t i = 0; i < thread_count_; ++i) {
        {
            std::lock_guard<std::mutex> lock(jobs_[i]->mtx);
            jobs_[i]->has_work = true;
        }
        jobs_[i]->cv.notify_one();
    }

    // Wait for all workers to complete before returning to single-threaded core
    std::unique_lock<std::mutex> lock(main_mtx_);
    main_cv_.wait(lock, [&]() {
        for (std::size_t i = 0; i < thread_count_; ++i) {
            if (!jobs_[i]->done) return false;
        }
        return true;
    });
}

void IOThreadPool::parallel_write(const ClientList &clients, TaskFn write_fn) {
    if (!is_enabled() || clients.empty()) {
        for (const auto &c : clients) {
            if (c) write_fn(c);
        }
        return;
    }

    for (std::size_t i = 0; i < thread_count_; ++i) {
        std::lock_guard<std::mutex> lock(jobs_[i]->mtx);
        jobs_[i]->clients.clear();
        jobs_[i]->task = write_fn;
        jobs_[i]->done = false;
    }

    for (std::size_t i = 0; i < clients.size(); ++i) {
        std::size_t target = i % thread_count_;
        jobs_[target]->clients.push_back(clients[i]);
    }

    for (std::size_t i = 0; i < thread_count_; ++i) {
        {
            std::lock_guard<std::mutex> lock(jobs_[i]->mtx);
            jobs_[i]->has_work = true;
        }
        jobs_[i]->cv.notify_one();
    }

    std::unique_lock<std::mutex> lock(main_mtx_);
    main_cv_.wait(lock, [&]() {
        for (std::size_t i = 0; i < thread_count_; ++i) {
            if (!jobs_[i]->done) return false;
        }
        return true;
    });
}

} // namespace redisx::net
