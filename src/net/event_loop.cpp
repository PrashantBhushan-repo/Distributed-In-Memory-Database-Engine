#include "redisx/net/event_loop.h"
#include "redisx/core/logging.h"

#include <algorithm>
#include <cstring>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOGDI
#define NOGDI
#endif
#include <windows.h>
#ifdef ERROR
#undef ERROR
#endif
static inline int epoll_create1(int) { return 1; }
static inline int epoll_ctl(int, int, int, struct epoll_event *) { return 0; }
static inline int epoll_wait(int, struct epoll_event *, int, int timeout) {
    int wait_ms = (timeout < 0 || timeout > 10) ? 10 : timeout;
    if (wait_ms > 0) ::Sleep(static_cast<DWORD>(wait_ms));
    return 0;
}
#else
#include <unistd.h>
#endif

namespace redisx::net {

static constexpr int INITIAL_EPOLL_EVENT_CAPACITY = 1024;

EventLoop::EventLoop(std::shared_ptr<core::ITimeProvider> time_provider)
    : epoll_fd_(::epoll_create1(EPOLL_CLOEXEC)),
      time_provider_(time_provider ? time_provider : core::get_global_time_provider()),
      epoll_events_(INITIAL_EPOLL_EVENT_CAPACITY) {
    if (epoll_fd_ == -1) {
        REDISX_LOG_ERROR("Failed to create epoll instance");
    }
}

EventLoop::~EventLoop() {
#ifndef _WIN32
    if (epoll_fd_ != -1) {
        ::close(epoll_fd_);
    }
#endif
}

core::Result<void> EventLoop::add_fd(int fd, uint32_t events, EventCallback cb) {
    if (epoll_fd_ == -1 || fd < 0) {
        return core::ErrorCode::InvalidArgument;
    }

    struct epoll_event ev {};
    ev.events = events;
    ev.data.fd = fd;

    if (::epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, fd, &ev) < 0) {
        REDISX_LOG_ERROR("epoll_ctl ADD failed for fd %d: %s", fd, std::strerror(errno));
        return core::ErrorCode::SystemError;
    }

    file_events_[fd] = FileEvent{fd, events, std::move(cb)};
    return {};
}

core::Result<void> EventLoop::modify_fd(int fd, uint32_t events) {
    auto it = file_events_.find(fd);
    if (it == file_events_.end()) {
        return core::ErrorCode::NotFound;
    }

    struct epoll_event ev {};
    ev.events = events;
    ev.data.fd = fd;

    if (::epoll_ctl(epoll_fd_, EPOLL_CTL_MOD, fd, &ev) < 0) {
        REDISX_LOG_ERROR("epoll_ctl MOD failed for fd %d: %s", fd, std::strerror(errno));
        return core::ErrorCode::SystemError;
    }

    it->second.events = events;
    return {};
}

core::Result<void> EventLoop::remove_fd(int fd) {
    auto it = file_events_.find(fd);
    if (it == file_events_.end()) {
        return core::ErrorCode::NotFound;
    }

    ::epoll_ctl(epoll_fd_, EPOLL_CTL_DEL, fd, nullptr);
    file_events_.erase(it);
    return {};
}

TimerId EventLoop::add_timer(std::uint64_t delay_ms, TimerCallback cb) {
    TimerId id = next_timer_id_++;
    std::uint64_t expire_at = time_provider_->monotonic_now_ms() + delay_ms;

    auto key = std::make_pair(expire_at, id);
    timers_[key] = TimerEntry{id, expire_at, std::move(cb)};
    timer_lookup_[id] = key;
    return id;
}

bool EventLoop::cancel_timer(TimerId id) {
    auto lookup_it = timer_lookup_.find(id);
    if (lookup_it == timer_lookup_.end()) {
        return false;
    }

    timers_.erase(lookup_it->second);
    timer_lookup_.erase(lookup_it);
    return true;
}

void EventLoop::queue_deferred(std::function<void()> fn) {
    if (fn) {
        deferred_tasks_.push_back(std::move(fn));
    }
}

void EventLoop::process_timers() {
    if (timers_.empty()) {
        return;
    }

    std::uint64_t now = time_provider_->monotonic_now_ms();

    std::vector<TimerEntry> expired;
    for (auto it = timers_.begin(); it != timers_.end();) {
        if (it->first.first > now) {
            break;
        }
        expired.push_back(std::move(it->second));
        timer_lookup_.erase(it->second.id);
        it = timers_.erase(it);
    }

    for (const auto &entry : expired) {
        if (entry.callback) {
            entry.callback();
        }
    }
}

void EventLoop::process_deferred() {
    if (deferred_tasks_.empty()) {
        return;
    }

    std::vector<std::function<void()>> tasks;
    tasks.swap(deferred_tasks_);

    for (const auto &task : tasks) {
        if (task) {
            task();
        }
    }
}

int EventLoop::run_once(int max_timeout_ms) {
    if (epoll_fd_ == -1) {
        return -1;
    }

    // Compute poll timeout from nearest timer
    int poll_timeout = max_timeout_ms;

    if (!timers_.empty()) {
        std::uint64_t now = time_provider_->monotonic_now_ms();
        std::uint64_t nearest_expire = timers_.begin()->first.first;

        int timer_timeout = 0;
        if (nearest_expire > now) {
            timer_timeout = static_cast<int>(nearest_expire - now);
        }

        if (poll_timeout < 0 || timer_timeout < poll_timeout) {
            poll_timeout = timer_timeout;
        }
    }

    int num_events = ::epoll_wait(epoll_fd_, epoll_events_.data(),
                                  static_cast<int>(epoll_events_.size()), poll_timeout);

    if (num_events < 0) {
        if (errno == EINTR) {
            return 0;
        }
        REDISX_LOG_ERROR("epoll_wait error: %s", std::strerror(errno));
        return -1;
    }

    // Expand capacity dynamically if needed
    if (static_cast<size_t>(num_events) == epoll_events_.size()) {
        epoll_events_.resize(epoll_events_.size() * 2);
    }

    for (int i = 0; i < num_events; ++i) {
        size_t idx = static_cast<size_t>(i);
        int fd = epoll_events_[idx].data.fd;
        uint32_t revents = epoll_events_[idx].events;

        auto it = file_events_.find(fd);
        if (it != file_events_.end() && it->second.callback) {
            it->second.callback(revents);
        }
    }

    process_timers();
    process_deferred();

    return num_events;
}

void EventLoop::run() {
    running_ = true;
    while (running_) {
        run_once(100);
    }
}

void EventLoop::stop() noexcept {
    running_ = false;
}

} // namespace redisx::net
