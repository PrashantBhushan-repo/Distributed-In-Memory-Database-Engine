#include "redisx/core/buffer.h"

#include <gtest/gtest.h>
#include <string>
#include <string_view>

using namespace redisx::core;

TEST(BufferTest, BasicAppendAndConsume) {
    Buffer buf(128);
    EXPECT_EQ(buf.readable_bytes(), 0);
    EXPECT_EQ(buf.capacity(), 128);

    std::string payload = "Hello RedisX!";
    buf.append(payload);

    EXPECT_EQ(buf.readable_bytes(), payload.size());
    EXPECT_EQ(buf.peek_string_view(), payload);

    buf.consume(6);
    EXPECT_EQ(buf.readable_bytes(), payload.size() - 6);
    EXPECT_EQ(buf.peek_string_view(), "RedisX!");

    buf.consume(payload.size());
    EXPECT_EQ(buf.readable_bytes(), 0);
    EXPECT_EQ(buf.read_offset(), 0); // Cursor auto-reset on full consume
}

TEST(BufferTest, ReserveAndExpansion) {
    Buffer buf(64);
    std::string large(500, 'A');

    buf.append(large);
    EXPECT_GE(buf.capacity(), 500);
    EXPECT_EQ(buf.readable_bytes(), 500);
    EXPECT_EQ(buf.peek_string_view(), large);
}

TEST(BufferTest, AutomaticCompaction) {
    Buffer buf(2048);

    // Append 1500 bytes
    std::string first(1500, 'X');
    buf.append(first);

    // Consume 1200 bytes -> read_pos_ = 1200, which is >= 1024 and >= capacity/2
    buf.consume(1200);

    // Further consume triggers compaction check
    std::string second(100, 'Y');
    buf.append(second);

    // Verify unread data intact
    EXPECT_EQ(buf.readable_bytes(), 400); // 300 remaining from first + 100 from second
    std::string unread_part1(300, 'X');
    std::string unread_part2(100, 'Y');
    EXPECT_EQ(buf.peek_string_view(), unread_part1 + unread_part2);
}

TEST(BufferTest, ClearResetsCursors) {
    Buffer buf(256);
    buf.append("some data");
    buf.clear();

    EXPECT_EQ(buf.readable_bytes(), 0);
    EXPECT_EQ(buf.read_offset(), 0);
}
