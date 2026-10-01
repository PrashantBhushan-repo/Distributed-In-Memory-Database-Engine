#ifndef REDISX_PROTO_LIMITS_H
#define REDISX_PROTO_LIMITS_H

#include <cstddef>

namespace redisx::proto {

// Maximum size allowed for a single bulk string (512 MB, matching Redis spec)
inline constexpr std::size_t MAX_BULK_SIZE = 512 * 1024 * 1024;

// Maximum number of arguments in a multibulk array (1,048,576 args)
inline constexpr std::size_t MAX_MULTIBULK_ARGS = 1024 * 1024;

// Maximum line size allowed for inline telnet-style commands (64 KB)
inline constexpr std::size_t MAX_INLINE_LINE_SIZE = 64 * 1024;

} // namespace redisx::proto

#endif // REDISX_PROTO_LIMITS_H
