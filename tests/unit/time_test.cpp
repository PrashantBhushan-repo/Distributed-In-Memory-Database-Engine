#include "redisx/core/time.h"

#include <gtest/gtest.h>
#include <memory>

using namespace redisx::core;

TEST(TimeTest, SystemTimeProviderBasic) {
    SystemTimeProvider time_provider;
    std::uint64_t mono1 = time_provider.monotonic_now_ms();
    std::uint64_t wall1 = time_provider.wall_now_ms();

    EXPECT_GT(mono1, 0u);
    EXPECT_GT(wall1, 0u);
}

TEST(TimeTest, MockTimeProviderAdvancement) {
    auto mock = std::make_shared<MockTimeProvider>(1000);
    EXPECT_EQ(mock->monotonic_now_ms(), 1000u);
    EXPECT_EQ(mock->wall_now_ms(), 1000u);

    mock->advance_ms(500);
    EXPECT_EQ(mock->monotonic_now_ms(), 1500u);
    EXPECT_EQ(mock->wall_now_ms(), 1500u);

    set_global_time_provider(mock);
    EXPECT_EQ(monotonic_now_ms(), 1500u);

    // Reset back to default
    set_global_time_provider(nullptr);
}
