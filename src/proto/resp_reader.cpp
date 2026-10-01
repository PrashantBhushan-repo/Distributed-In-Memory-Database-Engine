#include "redisx/proto/resp_reader.h"
#include "redisx/proto/inline_commands.h"
#include "redisx/proto/limits.h"

#include <charconv>
#include <cstring>
#include <limits>
#include <string_view>

namespace redisx::proto {

namespace {

// Helper to parse integer from string_view, strict numeric validation
bool parse_int64(std::string_view sv, std::int64_t &out) {
    if (sv.empty()) {
        return false;
    }
    const char *begin = sv.data();
    const char *end = sv.data() + sv.size();
    auto [ptr, ec] = std::from_chars(begin, end, out);
    return (ec == std::errc{} && ptr == end);
}

// Find CRLF \r\n in raw buffer
std::optional<std::size_t> find_crlf(const char *data, std::size_t len, std::size_t start_pos = 0) {
    for (std::size_t i = start_pos; i + 1 < len; ++i) {
        if (data[i] == '\r' && data[i + 1] == '\n') {
            return i;
        }
    }
    return std::nullopt;
}

} // namespace

core::Result<std::optional<Command>> RespReader::parse(core::Buffer &in_buf) {
    const std::size_t available = in_buf.readable_bytes();
    if (available == 0) {
        return std::optional<Command>(std::nullopt);
    }

    const char *data = reinterpret_cast<const char *>(in_buf.readable_data());

    // Check if multibulk array ('*') or inline command
    if (data[0] != '*') {
        // Handle Inline Command (telnet-style)
        std::optional<std::size_t> newline_pos;
        std::size_t delim_len = 2;

        auto crlf_opt = find_crlf(data, available);
        if (crlf_opt.has_value()) {
            newline_pos = crlf_opt.value();
            delim_len = 2;
        } else {
            // Check for lone '\n'
            for (std::size_t i = 0; i < available; ++i) {
                if (data[i] == '\n') {
                    newline_pos = i;
                    delim_len = 1;
                    break;
                }
            }
        }

        if (!newline_pos.has_value()) {
            if (available > MAX_INLINE_LINE_SIZE) {
                return core::ErrorCode::ProtocolError;
            }
            return std::optional<Command>(std::nullopt);
        }

        std::size_t line_end = newline_pos.value();
        std::string_view line(data, line_end);

        auto cmd_res = parse_inline_command(line);
        if (cmd_res.is_error()) {
            return core::ErrorCode::ProtocolError;
        }

        in_buf.consume(line_end + delim_len);
        return std::optional<Command>(cmd_res.value());
    }

    // RESP Multibulk Array (*<count>\r\n)
    auto crlf_opt = find_crlf(data, available, 0);
    if (!crlf_opt.has_value()) {
        if (available > 64) { // Header longer than reasonable limit without CRLF
            return core::ErrorCode::ProtocolError;
        }
        return std::optional<Command>(std::nullopt);
    }

    std::size_t count_header_end = crlf_opt.value();
    std::string_view count_str(data + 1, count_header_end - 1);

    std::int64_t count = 0;
    if (!parse_int64(count_str, count)) {
        return core::ErrorCode::ProtocolError;
    }

    if (count < -1) {
        return core::ErrorCode::ProtocolError;
    }

    if (count > static_cast<std::int64_t>(MAX_MULTIBULK_ARGS)) {
        return core::ErrorCode::ProtocolError;
    }

    if (count == -1 || count == 0) {
        // Null array or 0-element array
        in_buf.consume(count_header_end + 2);
        return std::optional<Command>(Command(std::vector<std::string>{}));
    }

    std::size_t cursor = count_header_end + 2;
    std::vector<std::string> args;
    args.reserve(static_cast<std::size_t>(count));

    for (std::int64_t i = 0; i < count; ++i) {
        if (cursor >= available) {
            return std::optional<Command>(std::nullopt);
        }

        char elem_type = data[cursor];
        if (elem_type == '$') {
            // Bulk string: $<len>\r\n<data>\r\n
            auto len_crlf = find_crlf(data, available, cursor);
            if (!len_crlf.has_value()) {
                if (available - cursor > 64) {
                    return core::ErrorCode::ProtocolError;
                }
                return std::optional<Command>(std::nullopt);
            }

            std::size_t len_header_end = len_crlf.value();
            std::string_view len_str(data + cursor + 1, len_header_end - (cursor + 1));

            std::int64_t bulk_len = 0;
            if (!parse_int64(len_str, bulk_len)) {
                return core::ErrorCode::ProtocolError;
            }

            if (bulk_len < -1) {
                return core::ErrorCode::ProtocolError;
            }

            if (bulk_len > static_cast<std::int64_t>(MAX_BULK_SIZE)) {
                return core::ErrorCode::ProtocolError;
            }

            if (bulk_len == -1) {
                // Null bulk string
                args.push_back("");
                cursor = len_header_end + 2;
                continue;
            }

            std::size_t payload_start = len_header_end + 2;
            std::size_t total_elem_needed = payload_start + static_cast<std::size_t>(bulk_len) + 2;

            if (available < total_elem_needed) {
                return std::optional<Command>(std::nullopt);
            }

            // Verify trailing CRLF
            const char *payload_end = data + payload_start + bulk_len;
            if (payload_end[0] != '\r' || payload_end[1] != '\n') {
                return core::ErrorCode::ProtocolError;
            }

            args.emplace_back(data + payload_start, static_cast<std::size_t>(bulk_len));
            cursor = total_elem_needed;
        } else if (elem_type == '+' || elem_type == ':' || elem_type == '-') {
            // Simple string, integer, or error element in array
            auto elem_crlf = find_crlf(data, available, cursor);
            if (!elem_crlf.has_value()) {
                if (available - cursor > MAX_INLINE_LINE_SIZE) {
                    return core::ErrorCode::ProtocolError;
                }
                return std::optional<Command>(std::nullopt);
            }

            std::size_t elem_end = elem_crlf.value();
            args.emplace_back(data + cursor + 1, elem_end - (cursor + 1));
            cursor = elem_end + 2;
        } else {
            // Invalid element type in RESP multibulk
            return core::ErrorCode::ProtocolError;
        }
    }

    // Successfully parsed all elements
    in_buf.consume(cursor);
    return std::optional<Command>(Command(std::move(args)));
}

} // namespace redisx::proto
