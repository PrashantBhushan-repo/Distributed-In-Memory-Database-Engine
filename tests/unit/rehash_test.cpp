#include "redisx/db/dict.h"

#include <gtest/gtest.h>
#include <set>
#include <string>

using namespace redisx::db;

TEST(RehashTest, ScanReverseBinaryCursorAcrossRehash) {
    Dict dict;
    constexpr size_t NUM_KEYS = 500;

    for (size_t i = 0; i < NUM_KEYS; ++i) {
        dict.insert_or_assign("item_" + std::to_string(i), Value("value"));
    }

    // Force dict into rehashing state
    dict.expand(1024);
    ASSERT_TRUE(dict.is_rehashing());

    std::set<std::string> scanned_keys;
    uint64_t cursor = 0;

    do {
        cursor = dict.scan(cursor, [&](const Entry *e) {
            if (e != nullptr) {
                scanned_keys.insert(e->key);
            }
        });
    } while (cursor != 0);

    // Assert that every key present in the table was returned at least once
    for (size_t i = 0; i < NUM_KEYS; ++i) {
        std::string expected_key = "item_" + std::to_string(i);
        EXPECT_EQ(scanned_keys.count(expected_key), 1u)
            << "SCAN missed key: " << expected_key;
    }
}
