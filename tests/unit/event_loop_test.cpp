#include "redisx/core/time.h"
#include "redisx/net/event_loop.h"

#include <gtest/gtest.h>
#include <memory>

using namespace redisx::core;
using namespace redisx::net;

TEST(EventLoopTest, TimerExpiration) {
    auto mock_clock = std::make_shared<MockTimeProvider>(1000);
    EventLoop loop(mock_clock);

    bool timer_fired = false;
    loop.add_timer(500, [&timer_fired]() { timer_fired = true; });

    // Run loop once with 0 timeout (clock at 1000, timer at 1500)
    loop.run_once(0);
    EXPECT_FALSE(timer_fired);

    // Advance mock clock past 1500 ms
    mock_clock->advance_ms(600); // clock at 1600

    loop.run_once(0);
    EXPECT_TRUE(timer_fired);
}

TEST(EventLoopTest, CancelTimer) {
    auto mock_clock = std::make_shared<MockTimeProvider>(1000);
    EventLoop loop(mock_clock);

    bool timer_fired = false;
    TimerId tid = loop.add_timer(500, [&timer_fired]() { timer_fired = true; });

    EXPECT_TRUE(loop.cancel_timer(tid));
    EXPECT_FALSE(loop.cancel_timer(tid)); // Second cancel returns false

    mock_clock->advance_ms(600);
    loop.run_once(0);

    EXPECT_FALSE(timer_fired);
}
