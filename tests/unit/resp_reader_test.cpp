#include "redisx/core/buffer.h"
#include "redisx/proto/resp_reader.h"

#include <gtest/gtest.h>
#include <string>
#include <vector>

using namespace redisx::core;
using namespace redisx::proto;

TEST(RespReaderTest, ParseMultibulkCommand) {
    Buffer buf;
    std::string data = "*2\r\n$4\r\nPING\r\n$5\r\nhello\r\n";
    buf.append(data.data(), data.size());

    auto result = RespReader::parse(buf);
    ASSERT_TRUE(result.has_value());
    ASSERT_TRUE(result.value().has_value());

    const auto &cmd = result.value().value();
    EXPECT_EQ(cmd.arg_count(), 2u);
    EXPECT_EQ(cmd.name_upper(), "PING");
    EXPECT_EQ(cmd.arg(0), "PING");
    EXPECT_EQ(cmd.arg(1), "hello");
    EXPECT_EQ(buf.readable_bytes(), 0u);
}

TEST(RespReaderTest, ParseInlineCommand) {
    Buffer buf;
    std::string data = "SET foo \"hello world\"\r\n";
    buf.append(data.data(), data.size());

    auto result = RespReader::parse(buf);
    ASSERT_TRUE(result.has_value());
    ASSERT_TRUE(result.value().has_value());

    const auto &cmd = result.value().value();
    EXPECT_EQ(cmd.arg_count(), 3u);
    EXPECT_EQ(cmd.name_upper(), "SET");
    EXPECT_EQ(cmd.arg(0), "SET");
    EXPECT_EQ(cmd.arg(1), "foo");
    EXPECT_EQ(cmd.arg(2), "hello world");
    EXPECT_EQ(buf.readable_bytes(), 0u);
}

TEST(RespReaderTest, ByteAtATimeStreaming) {
    Buffer buf;
    std::string data = "*3\r\n$3\r\nSET\r\n$4\r\nkey1\r\n$6\r\nval123\r\n";

    for (size_t i = 0; i < data.size(); ++i) {
        buf.append(data.data() + i, 1);
        auto result = RespReader::parse(buf);
        ASSERT_TRUE(result.has_value());

        if (i < data.size() - 1) {
            EXPECT_FALSE(result.value().has_value());
        } else {
            ASSERT_TRUE(result.value().has_value());
            const auto &cmd = result.value().value();
            EXPECT_EQ(cmd.name_upper(), "SET");
            EXPECT_EQ(cmd.arg_count(), 3u);
            EXPECT_EQ(cmd.arg(1), "key1");
            EXPECT_EQ(cmd.arg(2), "val123");
        }
    }
    EXPECT_EQ(buf.readable_bytes(), 0u);
}

TEST(RespReaderTest, PipelinedCommands) {
    Buffer buf;
    std::string data = "*1\r\n$4\r\nPING\r\n*2\r\n$4\r\nECHO\r\n$5\r\nhello\r\n";
    buf.append(data.data(), data.size());

    // First command
    auto res1 = RespReader::parse(buf);
    ASSERT_TRUE(res1.has_value() && res1.value().has_value());
    EXPECT_EQ(res1.value().value().name_upper(), "PING");

    // Second command
    auto res2 = RespReader::parse(buf);
    ASSERT_TRUE(res2.has_value() && res2.value().has_value());
    EXPECT_EQ(res2.value().value().name_upper(), "ECHO");
    EXPECT_EQ(res2.value().value().arg(1), "hello");

    EXPECT_EQ(buf.readable_bytes(), 0u);
}

TEST(RespReaderTest, MalformedInputsReturnProtocolError) {
    // 1. Invalid array count length < -1
    {
        Buffer buf;
        std::string bad = "*-2\r\n";
        buf.append(bad.data(), bad.size());
        auto res = RespReader::parse(buf);
        EXPECT_TRUE(res.is_error());
        EXPECT_EQ(res.error(), ErrorCode::ProtocolError);
    }

    // 2. Non-numeric bulk length
    {
        Buffer buf;
        std::string bad = "*1\r\n$abc\r\nfoo\r\n";
        buf.append(bad.data(), bad.size());
        auto res = RespReader::parse(buf);
        EXPECT_TRUE(res.is_error());
        EXPECT_EQ(res.error(), ErrorCode::ProtocolError);
    }

    // 3. Missing CRLF after bulk data
    {
        Buffer buf;
        std::string bad = "*1\r\n$3\r\nfooXX";
        buf.append(bad.data(), bad.size());
        auto res = RespReader::parse(buf);
        EXPECT_TRUE(res.is_error());
        EXPECT_EQ(res.error(), ErrorCode::ProtocolError);
    }

    // 4. Absurdly large multibulk count
    {
        Buffer buf;
        std::string bad = "*2000000\r\n";
        buf.append(bad.data(), bad.size());
        auto res = RespReader::parse(buf);
        EXPECT_TRUE(res.is_error());
        EXPECT_EQ(res.error(), ErrorCode::ProtocolError);
    }

    // 5. Absurdly large bulk string length
    {
        Buffer buf;
        std::string bad = "*1\r\n$600000000\r\n";
        buf.append(bad.data(), bad.size());
        auto res = RespReader::parse(buf);
        EXPECT_TRUE(res.is_error());
        EXPECT_EQ(res.error(), ErrorCode::ProtocolError);
    }
}
