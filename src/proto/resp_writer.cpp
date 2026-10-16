#include "redisx/proto/resp_writer.h"

#include <cinttypes>
#include <cstdio>
#include <string_view>

namespace redisx::proto {

static inline void append_formatted_header(core::Buffer &buf, const char *fmt, long long value) {
    char header[64];
    int n = std::snprintf(header, sizeof(header), fmt, value);
    if (n > 0) {
        buf.append(header, static_cast<size_t>(n));
    }
}

void RespWriter::write_simple_string(core::Buffer &buf, std::string_view str) {
    buf.append("+");
    buf.append(str.data(), str.size());
    buf.append("\r\n");
}

void RespWriter::write_error(core::Buffer &buf, std::string_view err) {
    buf.append("-");
    buf.append(err.data(), err.size());
    buf.append("\r\n");
}

void RespWriter::write_integer(core::Buffer &buf, std::int64_t val) {
    append_formatted_header(buf, ":%lld\r\n", static_cast<long long>(val));
}

void RespWriter::write_bulk_string(core::Buffer &buf, std::string_view str) {
    append_formatted_header(buf, "$%lld\r\n", static_cast<long long>(str.size()));
    if (!str.empty()) {
        buf.append(str.data(), str.size());
    }
    buf.append("\r\n");
}

void RespWriter::write_null_bulk(core::Buffer &buf) {
    buf.append("$-1\r\n");
}

void RespWriter::write_null_array(core::Buffer &buf) {
    buf.append("*-1\r\n");
}

void RespWriter::write_array_header(core::Buffer &buf, std::size_t count) {
    append_formatted_header(buf, "*%lld\r\n", static_cast<long long>(count));
}

void RespWriter::write_string_array(core::Buffer &buf, const std::vector<std::string> &arr) {
    write_array_header(buf, arr.size());
    for (const auto &item : arr) {
        write_bulk_string(buf, item);
    }
}

void RespWriter::write_command_docs(core::Buffer &buf) {
    // Reply with an empty array *0\r\n so redis-cli connects cleanly without error
    write_array_header(buf, 0);
}

} // namespace redisx::proto
