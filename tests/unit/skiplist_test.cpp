#include "redisx/types/skiplist.h"
#include <gtest/gtest.h>

TEST(SkiplistTest, BasicInsertAndScore) {
    redisx::types::Skiplist zs;
    EXPECT_TRUE(zs.empty());
    EXPECT_EQ(zs.size(), 0);

    EXPECT_TRUE(zs.insert(10.5, "alice"));
    EXPECT_TRUE(zs.insert(20.0, "bob"));
    EXPECT_TRUE(zs.insert(5.0, "charlie"));

    EXPECT_EQ(zs.size(), 3);
    EXPECT_DOUBLE_EQ(*zs.get_score("alice"), 10.5);
    EXPECT_DOUBLE_EQ(*zs.get_score("bob"), 20.0);
    EXPECT_DOUBLE_EQ(*zs.get_score("charlie"), 5.0);
}

TEST(SkiplistTest, RankAndRange) {
    redisx::types::Skiplist zs;
    zs.insert(100.0, "p1");
    zs.insert(200.0, "p2");
    zs.insert(300.0, "p3");

    EXPECT_EQ(*zs.get_rank(100.0, "p1"), 0);
    EXPECT_EQ(*zs.get_rank(200.0, "p2"), 1);
    EXPECT_EQ(*zs.get_rank(300.0, "p3"), 2);

    auto range = zs.range_by_rank(0, 1);
    ASSERT_EQ(range.size(), 2);
    EXPECT_EQ(range[0].first, "p1");
    EXPECT_EQ(range[1].first, "p2");
}

TEST(SkiplistTest, RemoveMember) {
    redisx::types::Skiplist zs;
    zs.insert(50.0, "mem1");
    zs.insert(60.0, "mem2");

    EXPECT_TRUE(zs.remove(50.0, "mem1"));
    EXPECT_EQ(zs.size(), 1);
    EXPECT_FALSE(zs.get_score("mem1").has_value());
    EXPECT_TRUE(zs.get_score("mem2").has_value());
}
