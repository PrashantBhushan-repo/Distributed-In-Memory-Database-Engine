#include "redisx/db/keyspace.h"

#include <gtest/gtest.h>

using namespace redisx::db;

TEST(KeyspaceTest, MultiDatabaseIsolation) {
    Keyspace ks;

    // Database 0
    ks.db_set(0, "keyA", Value("val0"));
    EXPECT_TRUE(ks.db_exists(0, "keyA"));
    EXPECT_FALSE(ks.db_exists(1, "keyA"));
    EXPECT_EQ(ks.db_size(0), 1u);
    EXPECT_EQ(ks.db_size(1), 0u);

    // Database 1
    ks.db_set(1, "keyA", Value("val1"));
    EXPECT_TRUE(ks.db_exists(1, "keyA"));
    EXPECT_EQ(ks.db_size(1), 1u);

    // Values are distinct per database
    Entry *e0 = ks.db_get(0, "keyA");
    Entry *e1 = ks.db_get(1, "keyA");
    ASSERT_NE(e0, nullptr);
    ASSERT_NE(e1, nullptr);
    EXPECT_EQ(e0->value.as_string(), "val0");
    EXPECT_EQ(e1->value.as_string(), "val1");

    // Flush Database 0
    ks.flush_db(0);
    EXPECT_EQ(ks.db_size(0), 0u);
    EXPECT_EQ(ks.db_size(1), 1u);
}
