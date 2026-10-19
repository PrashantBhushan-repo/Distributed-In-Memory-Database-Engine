#include "redisx/commands/expire_cmds.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/commands/hash_cmds.h"
#include "redisx/commands/zset_cmds.h"
#include "redisx/config/config.h"
#include "redisx/persistence/format.h"
#include "redisx/commands/set_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/security/acl.h"
#include "redisx/memory/accounting.h"
#include "redisx/core/time.h"
#include "redisx/persistence/recovery.h"
#include "redisx/persistence/snapshot_reader.h"
#include "redisx/persistence/snapshot_writer.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/limits.h"
#include <gtest/gtest.h>
#include <filesystem>
#include <fstream>
#include <limits>

namespace redisx::test {
using namespace std::string_literals;
class EngineAudit : public ::testing::Test {
protected:
    std::shared_ptr<core::MockTimeProvider> clock = std::make_shared<core::MockTimeProvider>(100000);
    db::TTLManager ttl{clock};
    db::Keyspace keys;
    commands::Dispatcher dispatcher;
    void SetUp() override {
        commands::register_string_commands(dispatcher, ttl);
        commands::register_expire_commands(dispatcher, ttl);
        commands::register_set_commands(dispatcher);
        commands::register_list_commands(dispatcher);
        commands::register_hash_commands(dispatcher);
        commands::register_zset_commands(dispatcher);
    }
    std::string run(std::vector<std::string> args) {
        core::Buffer out;
        std::size_t selected = 0;
        dispatcher.dispatch(proto::Command(std::move(args)), keys, 0, out, selected, nullptr, &ttl);
        return std::string(out.peek_string_view());
    }
};
TEST_F(EngineAudit, RejectsNullAndNonBulkCommandArguments) {
    for (const auto &input : {"*1\r\n$-1\r\n", "*1\r\n+PING\r\n", "*1\r\n:123\r\n", "*-1\r\n"}) {
        core::Buffer buffer; buffer.append(input);
        EXPECT_TRUE(proto::RespReader::parse(buffer).is_error()) << input;
    }
}
TEST_F(EngineAudit, InlineNewlineDoesNotMergeTheNextCommand) {
    core::Buffer buffer; buffer.append("PING\nECHO hello\r\n");
    auto first = proto::RespReader::parse(buffer);
    ASSERT_TRUE(first.has_value()); ASSERT_TRUE(first.value().has_value());
    EXPECT_EQ(first.value()->args(), std::vector<std::string>{"PING"});
}
TEST_F(EngineAudit, RejectsUnterminatedOrConcatenatedQuotes) {
    for (const auto &input : {"SET a \"unterminated\r\n", "SET a \"value\"suffix\r\n", "SET a 'unterminated\r\n"}) {
        core::Buffer buffer; buffer.append(input);
        EXPECT_TRUE(proto::RespReader::parse(buffer).is_error());
    }
}
TEST_F(EngineAudit, RejectsOversizedCompletedInlineInput) {
    core::Buffer buffer; buffer.append(std::string(proto::MAX_INLINE_LINE_SIZE + 1, 'a') + "\r\n");
    EXPECT_TRUE(proto::RespReader::parse(buffer).is_error());
}
TEST_F(EngineAudit, SetRejectsUnknownAndConflictingOptionsWithoutMutation) {
    ASSERT_EQ(run({"SET", "key", "original"}), "+OK\r\n");
    for (const auto &options : std::vector<std::vector<std::string>>{{"BOGUS"}, {"EX"}, {"EX", "1", "PX", "2"}, {"KEEPTTL", "EX", "1"}}) {
        std::vector<std::string> args{"SET", "key", "changed"}; args.insert(args.end(), options.begin(), options.end());
        EXPECT_TRUE(run(args).starts_with("-ERR"));
        EXPECT_EQ(run({"GET", "key"}), "$8\r\noriginal\r\n");
    }
}
TEST_F(EngineAudit, SetGetWrongTypeDoesNotOverwrite) {
    run({"HSET", "key", "field", "value"});
    EXPECT_TRUE(run({"SET", "key", "changed", "GET"}).starts_with("-WRONGTYPE"));
    EXPECT_EQ(run({"TYPE", "key"}), "+hash\r\n");
}
TEST_F(EngineAudit, CheckedIntegerArithmeticDoesNotWrap) {
    run({"SET", "n", "9223372036854775807"});
    EXPECT_TRUE(run({"INCR", "n"}).starts_with("-ERR"));
    EXPECT_EQ(run({"GET", "n"}), "$19\r\n9223372036854775807\r\n");
    run({"SET", "n", "-9223372036854775808"});
    EXPECT_TRUE(run({"DECR", "n"}).starts_with("-ERR"));
    EXPECT_TRUE(run({"INCRBY", "n", "-1"}).starts_with("-ERR"));
}
TEST_F(EngineAudit, ExpirationRejectsOverflow) {
    run({"SET", "k", "v"});
    EXPECT_TRUE(run({"SET", "k", "changed", "EX", "9223372036854775807"}).starts_with("-ERR"));
    EXPECT_EQ(run({"GET", "k"}), "$1\r\nv\r\n");
    EXPECT_TRUE(run({"EXPIRE", "k", "9223372036854775807"}).starts_with("-ERR"));
}
TEST_F(EngineAudit, NegativeAbsoluteExpiryDeletesImmediately) {
    run({"SET", "k", "v"});
    EXPECT_EQ(run({"EXPIREAT", "k", "-1"}), ":1\r\n");
    EXPECT_EQ(run({"GET", "k"}), "$-1\r\n");
}
TEST_F(EngineAudit, AbsoluteExpiryHonorsConditionsAndSyntax) {
    run({"SET", "k", "v"}); run({"PEXPIRE", "k", "5000"});
    EXPECT_EQ(run({"PEXPIREAT", "k", "102000", "NX"}), ":0\r\n");
    EXPECT_TRUE(run({"PEXPIREAT", "k", "102000", "BOGUS"}).starts_with("-ERR"));
    EXPECT_EQ(run({"PTTL", "k"}), ":5000\r\n");
}
TEST_F(EngineAudit, TtlRoundsToNearestSecond) {
    run({"SET", "k", "v", "PX", "499"});
    EXPECT_EQ(run({"TTL", "k"}), ":0\r\n");
}
TEST_F(EngineAudit, CollectionReadsHonorExpiration) {
    run({"HSET", "k", "f", "v"}); run({"PEXPIRE", "k", "10"}); clock->advance_ms(11);
    EXPECT_EQ(run({"HGET", "k", "f"}), "$-1\r\n");
}
TEST_F(EngineAudit, InvalidSortedSetScoresAreAtomicAndDoNotThrow) {
    run({"ZADD", "z", "1", "a"});
    std::string result;
    EXPECT_NO_THROW(result = run({"ZADD", "z", "2", "b", "invalid", "c"}));
    EXPECT_TRUE(result.starts_with("-ERR"));
    EXPECT_EQ(run({"ZCARD", "z"}), ":1\r\n");
    EXPECT_TRUE(run({"ZADD", "z", "nan", "d"}).starts_with("-ERR"));
}
TEST_F(EngineAudit, ConfigurationRejectsPartialIntegersAndInvalidBooleans) {
    config::ConfigManager cfg; std::string error;
    EXPECT_FALSE(cfg.config_set("maxmemory", "100junk", error));
    EXPECT_FALSE(cfg.config_set("appendonly", "perhaps", error));
    EXPECT_TRUE(cfg.config_set("maxmemory", "2mb", error));
    EXPECT_EQ(cfg.get_int("maxmemory"), 2 * 1024 * 1024);
}
TEST_F(EngineAudit, ConfigurationFileCanSetStartupOnlyParameters) {
    auto path = std::filesystem::temp_directory_path() / "redisx-audit-config.conf";
    { std::ofstream file(path); file << "bind 127.0.0.2\nport 16389\nrequirepass \"with spaces # value\"\n"; }
    config::ConfigManager cfg;
    EXPECT_TRUE(cfg.load_file(path.string()));
    EXPECT_EQ(cfg.get_int("port"), 16389);
    EXPECT_EQ(cfg.get_string("bind"), "127.0.0.2");
    EXPECT_EQ(cfg.get_string("requirepass"), "with spaces # value");
    std::filesystem::remove(path);
}
TEST_F(EngineAudit, CorruptSnapshotDoesNotModifyExistingKeyspace) {
    auto path = std::filesystem::temp_directory_path() / "redisx-audit-snapshot.rdb";
    db::Keyspace saved; saved.db_set(0, "unexpected", db::Value("value"));
    ASSERT_TRUE(persistence::SnapshotWriter{}.write_snapshot(saved, path.string()));
    { std::fstream file(path, std::ios::in | std::ios::out | std::ios::binary); file.seekp(-1, std::ios::end); file.put('\x7f'); }
    keys.db_set(0, "original", db::Value("keep"));
    EXPECT_TRUE(persistence::SnapshotReader{}.load_snapshot(keys, path.string()).is_error());
    EXPECT_EQ(keys.db_size(0), 1u);
    EXPECT_FALSE(keys.db_exists(0, "unexpected"));
    std::filesystem::remove(path);
}
TEST_F(EngineAudit, AofReplayRejectsUnknownCommands) {
    auto path = std::filesystem::temp_directory_path() / "redisx-audit-unknown.aof";
    { std::ofstream file(path); file << "*1\r\n$7\r\nUNKNOWN\r\n"; }
    EXPECT_TRUE(persistence::RecoveryEngine::recover(keys, dispatcher, "", path.string()).is_error());
    std::filesystem::remove(path);
}
TEST_F(EngineAudit, SortedSetOrdersAndRetainsPrecision) {
    run({"ZADD", "z", "2", "b", "1", "c", "1", "a", "0.123456789012345", "precise"});
    EXPECT_EQ(run({"ZRANGE", "z", "-3", "-1"}), "*3\r\n$1\r\na\r\n$1\r\nc\r\n$1\r\nb\r\n");
    EXPECT_EQ(run({"ZRANK", "z", "b"}), ":3\r\n");
    EXPECT_TRUE(run({"ZSCORE", "z", "precise"}).find("0.123456789012345") != std::string::npos);
    EXPECT_TRUE(run({"ZRANGE", "z", "0garbage", "-1"}).starts_with("-ERR"));
}
TEST_F(EngineAudit, IntegerSetPreservesTextIdentity) {
    EXPECT_EQ(run({"SADD", "s", "1", "01", "-0", "0"}), ":4\r\n");
    EXPECT_EQ(run({"SCARD", "s"}), ":4\r\n");
}
TEST_F(EngineAudit, CollectionGrowthChangesMemoryAccounting) {
    const auto before = memory::MemoryTracker::instance().used_memory();
    run({"RPUSH", "large", std::string(10000, 'x')});
    EXPECT_GE(memory::MemoryTracker::instance().used_memory(), before + 10000);
    run({"DEL", "large"});
    EXPECT_EQ(memory::MemoryTracker::instance().used_memory(), before);
}
TEST_F(EngineAudit, Crc64MatchesKnownJonesVector) {
    constexpr std::string_view input = "123456789";
    EXPECT_EQ(persistence::crc64(0, reinterpret_cast<const std::uint8_t *>(input.data()), input.size()), 0xe9c6d914c4b8d9caULL);
}
TEST_F(EngineAudit, AclUnknownUsersAndInvalidEditsFailClosed) {
    security::AclEngine acl; std::string error;
    EXPECT_FALSE(acl.authenticate("missing", ""));
    ASSERT_TRUE(acl.set_user_rules("empty", {}, error));
    EXPECT_FALSE(acl.authenticate("empty", ""));
    ASSERT_TRUE(acl.set_user_rules("reader", {"on", ">secret", "+@read", "~safe:*"}, error));
    EXPECT_FALSE(acl.set_user_rules("reader", {"+@write", "invalid"}, error));
    const auto *user = acl.get_user("reader"); ASSERT_NE(user, nullptr);
    EXPECT_FALSE(acl.check_permission(*user, proto::Command({"SET", "safe:x", "v"}), dispatcher.find_command("SET")));
    EXPECT_FALSE(acl.check_permission(*user, proto::Command({"EXISTS", "safe:x", "private:x"}), dispatcher.find_command("EXISTS")));
}
TEST_F(EngineAudit, PackedRepresentationsStoreIntegersAndBinarySafely) {
    types::Listpack packed;
    const std::vector<std::string> values = {"", "0", "01", "-0", "-9223372036854775808", "9223372036854775807", std::string("a\0b", 3)};
    for (const auto &value : values) packed.push_back(value);
    EXPECT_EQ(packed.to_vector(), values);
    EXPECT_TRUE(packed.replace(0, "changed")); EXPECT_TRUE(packed.remove(1));
    types::Intset integers;
    integers.add(1); integers.add(2);
    EXPECT_EQ(integers.memory_usage(), 2 * sizeof(std::int16_t));
    integers.add(INT64_MIN); integers.add(INT64_MAX);
    EXPECT_TRUE(integers.contains(1)); EXPECT_EQ(integers.get(0), INT64_MIN);
}
TEST_F(EngineAudit, BufferSelfAppendAndOversizedReserveAreSafe) {
    core::Buffer buffer(4); buffer.append("abcd"); buffer.append(buffer.peek_string_view());
    EXPECT_EQ(buffer.peek_string_view(), "abcdabcd");
    EXPECT_THROW(buffer.reserve(SIZE_MAX), std::length_error);
    buffer.produce(SIZE_MAX); EXPECT_LE(buffer.readable_bytes(), buffer.capacity());
}
TEST_F(EngineAudit, StreamingReaderRetainsProgressAcrossSingleByteReads) {
    const std::string wire = "*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$3\r\na\0b\r\n"s;
    proto::StreamingRespReader parser; core::Buffer input;
    std::optional<proto::Command> command;
    for (const auto byte : wire) { input.append(&byte, 1); auto result = parser.parse(input); ASSERT_FALSE(result.is_error()); if (result.value()) command = std::move(*result.value()); }
    ASSERT_TRUE(command); EXPECT_EQ(command->arg(2), std::string("a\0b", 3)); EXPECT_EQ(input.readable_bytes(), 0u);
}
TEST_F(EngineAudit, GlobMatchingHandlesManyWildcardsWithoutRecursion) {
    std::string pattern;
    for (int i = 0; i < 400; ++i) pattern += "*a";
    pattern += "z";
    EXPECT_FALSE(commands::string_match_glob(pattern, std::string(400, 'a')));
    EXPECT_TRUE(commands::string_match_glob("[A-C]?*", "b42", true));
}
TEST_F(EngineAudit, RewrittenConfigurationRoundTripsControlCharacters) {
    const auto path = std::filesystem::temp_directory_path() / "redisx-audit-rewrite.conf";
    config::ConfigManager original; std::string error;
    const std::string password("line1\nline2\\\"\0end", 18);
    ASSERT_TRUE(original.config_set("requirepass", password, error));
    ASSERT_TRUE(original.config_rewrite(path.string()));
    config::ConfigManager loaded; ASSERT_TRUE(loaded.load_file(path.string()));
    EXPECT_EQ(loaded.get_string("requirepass"), password);
    std::filesystem::remove(path);
}
} // namespace redisx::test
