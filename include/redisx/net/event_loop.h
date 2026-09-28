#ifndef REDISX_NET_EVENT_LOOP_H
#define REDISX_NET_EVENT_LOOP_H

#include "redisx/core/errors.h"
#include "redisx/core/time.h"

#include <sys/epoll.h>
#include <functional>
#include <map>
#include <memory>
#include <vector>
#include <cstdint>

namespace redisx::net {

using EventCallback = std::function<void(uint32_t events)>;
using TimerCallback = std::function<void()>;
using TimerId = std::uint64_t;

struct FileEvent {
    int fd{-1};
    uint32_t events{0};
    EventCallback callback;
};

struct TimerEntry {
    TimerId id{0};
    std::uint64_t expiration_ms{0};
    TimerCallback callback;
};

class EventLoop {
  public:
    explicit EventLoop(std::shared_ptr<core::ITimeProvider> time_provider = nullptr);
    ~EventLoop();

    EventLoop(const EventLoop &) = delete;
    EventLoop &operator=(const EventLoop &) = delete;
    EventLoop(EventLoop &&) = delete;
    EventLoop &operator=(EventLoop &&) = delete;

    // Epoll event handlers
    core::Result<void> add_fd(int fd, uint32_t events, EventCallback cb);
    core::Result<void> modify_fd(int fd, uint32_t events);
    core::Result<void> remove_fd(int fd);

    // Timers
    TimerId add_timer(std::uint64_t delay_ms, TimerCallback cb);
    bool cancel_timer(TimerId id);

    // Event loop control
    int run_once(int max_timeout_ms = -1);
    void run();
    void stop() noexcept;
    [[nodiscard]] bool is_running() const noexcept { return running_; }

    // Deferred tasks (for safe connection teardown during loop iteration)
    void queue_deferred(std::function<void()> fn);

  private:
    void process_timers();
    void process_deferred();

    int epoll_fd_{-1};
    bool running_{false};
    std::shared_ptr<core::ITimeProvider> time_provider_;
    std::vector<struct epoll_event> epoll_events_;

    std::map<int, FileEvent> file_events_;
    
    TimerId next_timer_id_{1};
    // Map sorted by (expiration_ms, timer_id)
    std::map<std::pair<std::uint64_t, TimerId>, TimerEntry> timers_;
    std::map<TimerId, std::pair<std::uint64_t, TimerId>> timer_lookup_;

    std::vector<std::function<void()>> deferred_tasks_;
};

} // namespace redisx::net

#endif // REDISX_NET_EVENT_LOOP_H
