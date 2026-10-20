#include "redisx/proto/inline_commands.h"
#include <cctype>
#include <vector>
namespace redisx::proto {
core::Result<Command> parse_inline_command(std::string_view line) {
    std::vector<std::string> args;
    std::size_t i = 0;
    const auto whitespace = [](char c) { return std::isspace(static_cast<unsigned char>(c)) != 0; };
    const auto hex = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    };
    while (i < line.size()) {
        while (i < line.size() && whitespace(line[i])) ++i;
        if (i == line.size()) break;
        std::string arg;
        char quote = 0;
        while (i < line.size()) {
            char c = line[i++];
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                    if (i < line.size() && !whitespace(line[i])) return core::ErrorCode::ProtocolError;
                    break;
                }
                if (c == '\\' && quote == '\'' && i < line.size() && line[i] == '\'') {
                    arg.push_back(line[i++]);
                } else if (c == '\\' && quote == '"') {
                    if (i == line.size()) return core::ErrorCode::ProtocolError;
                    c = line[i++];
                    if (c == 'x' && i + 1 < line.size() && hex(line[i]) >= 0 && hex(line[i + 1]) >= 0) {
                        arg.push_back(static_cast<char>(hex(line[i]) * 16 + hex(line[i + 1]))); i += 2;
                    } else {
                        switch (c) {
                        case 'n': arg.push_back('\n'); break;
                        case 'r': arg.push_back('\r'); break;
                        case 't': arg.push_back('\t'); break;
                        case 'b': arg.push_back('\b'); break;
                        case 'a': arg.push_back('\a'); break;
                        default: arg.push_back(c); break;
                        }
                    }
                } else arg.push_back(c);
            } else if (whitespace(c)) break;
            else if (c == '"' || c == '\'') quote = c;
            else arg.push_back(c);
        }
        if (quote != 0) return core::ErrorCode::ProtocolError;
        args.push_back(std::move(arg));
    }
    // Blank inline commands are harmless keep-alives.
    return Command(std::move(args));
}
} // namespace redisx::proto
