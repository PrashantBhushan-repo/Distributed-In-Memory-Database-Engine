#ifndef REDISX_PROTO_RESP_READER_H
#define REDISX_PROTO_RESP_READER_H

#include "redisx/core/buffer.h"
#include "redisx/core/errors.h"
#include "redisx/proto/command.h"

#include <optional>

namespace redisx::proto {

class RespReader {
  public:
    // Attempts to parse a complete Command from the given input Buffer.
    // If a full command is successfully parsed, it is returned and its bytes
    // are consumed from `in_buf`.
    // If input is partial/incomplete, returns std::nullopt and consumes 0 bytes from `in_buf`.
    // If input violates RESP protocol or bounds, returns core::ErrorCode::ProtocolError.
    static core::Result<std::optional<Command>> parse(core::Buffer &in_buf);
};

} // namespace redisx::proto

#endif // REDISX_PROTO_RESP_READER_H
