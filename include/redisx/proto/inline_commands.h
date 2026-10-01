#ifndef REDISX_PROTO_INLINE_COMMANDS_H
#define REDISX_PROTO_INLINE_COMMANDS_H

#include "redisx/core/errors.h"
#include "redisx/proto/command.h"

#include <string_view>

namespace redisx::proto {

// Parses a telnet-style inline command line string into a Command object
core::Result<Command> parse_inline_command(std::string_view line);

} // namespace redisx::proto

#endif // REDISX_PROTO_INLINE_COMMANDS_H
