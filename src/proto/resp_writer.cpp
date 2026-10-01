#include "redisx/proto/resp_writer.h"

#include <string>

namespace redisx::proto {

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
    std::string s = ":" + std::to_string(val) + "\r\n";
    buf.append(s.data(), s.size());
}

void RespWriter::write_bulk_string(core::Buffer &buf, std::string_view str) {
    std::string header = "$" + std::to_string(str.size()) + "\r\n";
    buf.append(header.data(), header.size());
    buf.append(str.data(), str.size());
    buf.append("\r\n");
}

void RespWriter::write_null_bulk(core::Buffer &buf) {
    buf.append("$-1\r\n");
}

void RespWriter::write_null_array(core::Buffer &buf) {
    buf.append("*-1\r\n");
}

void RespWriter::write_array_header(core::Buffer &buf, std::size_t count) {
    std::string header = "*" + std::to_string(count) + "\r\n";
    buf.append(header.data(), header.size());
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
