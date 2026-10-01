#ifndef REDISX_PROTO_RESP_WRITER_H
#define REDISX_PROTO_RESP_WRITER_H

#include "redisx/core/buffer.h"

#include <cstdint>
#include <string_view>
#include <vector>

namespace redisx::proto {

class RespWriter {
  public:
    // Writes a simple string response (+<str>\r\n)
    static void write_simple_string(core::Buffer &buf, std::string_view str);

    // Writes an error response (-<err>\r\n)
    static void write_error(core::Buffer &buf, std::string_view err);

    // Writes an integer response (:<val>\r\n)
    static void write_integer(core::Buffer &buf, std::int64_t val);

    // Writes a bulk string response ($<len>\r\n<str>\r\n)
    static void write_bulk_string(core::Buffer &buf, std::string_view str);

    // Writes a null bulk string response ($-1\r\n)
    static void write_null_bulk(core::Buffer &buf);

    // Writes a null array response (*-1\r\n)
    static void write_null_array(core::Buffer &buf);

    // Writes an array header (*<count>\r\n)
    static void write_array_header(core::Buffer &buf, std::size_t count);

    // Convenience method to write a full array of bulk strings
    static void write_string_array(core::Buffer &buf, const std::vector<std::string> &arr);

    // Helper for minimal COMMAND reply (for redis-cli compatibility)
    static void write_command_docs(core::Buffer &buf);
};

} // namespace redisx::proto

#endif // REDISX_PROTO_RESP_WRITER_H
