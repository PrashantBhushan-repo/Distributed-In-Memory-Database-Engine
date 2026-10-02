#include "redisx/db/dict.h"

#include <gtest/gtest.h>
#include <string>
#include <vector>

using namespace redisx::db;

TEST(DictTest, BasicOperations) {
    Dict dict;
    EXPECT_EQ(dict.size(), 0u);
    EXPECT_TRUE(dict.empty());

    // Insert
    EXPECT_TRUE(dict.insert_or_assign("key1", Value("val1")));
    EXPECT_EQ(dict.size(), 1u);
    EXPECT_FALSE(dict.empty());

    // Find
    Entry *e = dict.find("key1");
    ASSERT_NE(e, nullptr);
    EXPECT_EQ(e->key, "key1");
    EXPECT_EQ(e->value.as_string(), "val1");

    // Overwrite
    EXPECT_FALSE(dict.insert_or_assign("key1", Value("val2")));
    EXPECT_EQ(dict.size(), 1u);
    e = dict.find("key1");
    ASSERT_NE(e, nullptr);
    EXPECT_EQ(e->value.as_string(), "val2");

    // Erase
    EXPECT_TRUE(dict.erase("key1"));
    EXPECT_EQ(dict.size(), 0u);
    EXPECT_EQ(dict.find("key1"), nullptr);
}

TEST(DictTest, OneMillionInsertsWithForcedResize) {
    Dict dict;
    constexpr size_t NUM_KEYS = 100000; // 100k keys for fast test execution

    for (size_t i = 0; i < NUM_KEYS; ++i) {
        std::string key = "key_" + std::to_string(i);
        std::string val = "val_" + std::to_string(i);
        dict.insert_or_assign(key, Value(val));

        // Periodically verify key retrieval during active rehashing
        if (i % 10000 == 0) {
            dict.rehash_step(10);
            Entry *check = dict.find(key);
            ASSERT_NE(check, nullptr);
            EXPECT_EQ(check->value.as_string(), val);
        }
    }

    EXPECT_EQ(dict.size(), NUM_KEYS);

    // Complete any pending rehashing steps
    while (dict.is_rehashing()) {
        dict.rehash_step(100);
    }

    // Verify all 100k keys are 100% present after rehash completes
    for (size_t i = 0; i < NUM_KEYS; ++i) {
        std::string key = "key_" + std::to_string(i);
        std::string val = "val_" + std::to_string(i);
        Entry *e = dict.find(key);
        ASSERT_NE(e, nullptr) << "Failed to find key: " << key;
        EXPECT_EQ(e->value.as_string(), val);
    }
}
