#include "redisx/types/object.h"
#include <gtest/gtest.h>

TEST(EncodingTest, ListpackToQuicklistPromotion) {
    redisx::types::Object obj = redisx::types::Object::create_list();
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Listpack);

    redisx::types::ObjectConfig cfg;
    cfg.list_max_listpack_entries = 5; // Promote when size > 5

    for (int i = 0; i < 5; ++i) {
        obj.list_push_back("item_" + std::to_string(i), cfg);
    }
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Listpack);

    obj.list_push_back("item_5", cfg);
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Quicklist);
    EXPECT_EQ(obj.list_len(), 6);
}

TEST(EncodingTest, IntsetToHashtablePromotion) {
    redisx::types::Object obj = redisx::types::Object::create_set();
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Intset);

    redisx::types::ObjectConfig cfg;
    cfg.set_max_intset_entries = 3;

    obj.set_add("100", cfg);
    obj.set_add("200", cfg);
    obj.set_add("300", cfg);
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Intset);

    // Non-integer string triggers promotion to Hashtable
    obj.set_add("not_an_int", cfg);
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Hashtable);
    EXPECT_TRUE(obj.set_contains("not_an_int"));
    EXPECT_TRUE(obj.set_contains("100"));
}

TEST(EncodingTest, ZSetListpackToSkiplistPromotion) {
    redisx::types::Object obj = redisx::types::Object::create_zset();
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Listpack);

    redisx::types::ObjectConfig cfg;
    cfg.zset_max_listpack_entries = 2;

    obj.zset_add(10.0, "m1", cfg);
    obj.zset_add(20.0, "m2", cfg);
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Listpack);

    obj.zset_add(30.0, "m3", cfg);
    EXPECT_EQ(obj.encoding(), redisx::types::Encoding::Skiplist);
    EXPECT_DOUBLE_EQ(*obj.zset_score("m3"), 30.0);
}
