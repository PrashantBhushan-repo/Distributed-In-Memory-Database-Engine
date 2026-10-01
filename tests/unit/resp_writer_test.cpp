#include "redisx/core/buffer.h"
#include "redisx/proto/resp_writer.h"

#include <gtest/gtest.h>
#include <string_view>

using namespace redisx::core;
using namespace redisx::proto;

TEST(RespWriterTest, WriteSimpleString) {
    Buffer buf;
    RespWriter::write_simple_string(buf, "OK");
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, "+OK\r\n");
}

TEST(RespWriterTest, WriteError) {
    Buffer buf;
    RespWriter::write_error(buf, "ERR unknown command 'FOO'");
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, "-ERR unknown command 'FOO'\r\n");
}

TEST(RespWriterTest, WriteInteger) {
    Buffer buf;
    RespWriter::write_integer(buf, 1000);
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, ":1000\r\n");
}

TEST(RespWriterTest, WriteBulkString) {
    Buffer buf;
    RespWriter::write_bulk_string(buf, "hello world");
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, "$11\r\nhello world\r\n");
}

TEST(RespWriterTest, WriteNullBulkAndArray) {
    Buffer buf;
    RespWriter::write_null_bulk(buf);
    RespWriter::write_null_array(buf);
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, "$-1\r\n*-1\r\n");
}

TEST(RespWriterTest, WriteStringArray) {
    Buffer buf;
    RespWriter::write_string_array(buf, {"foo", "bar"});
    std::string_view sv(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    EXPECT_EQ(sv, "*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n");
}
