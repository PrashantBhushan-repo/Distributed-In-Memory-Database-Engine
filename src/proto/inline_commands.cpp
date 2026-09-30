#include "redisx/proto/inline_commands.h"

#include <vector>

namespace redisx::proto {

core::Result<Command> parse_inline_command(std::string_view line) {
    std::vector<std::string> args;
    std::size_t i = 0;
    const std::size_t len = line.size();

    // Strip trailing \r or \n if present
    while (len > 0 && (line[len - 1] == '\r' || line[len - 1] == '\n')) {
        line.remove_suffix(1);
    }

    const std::size_t n = line.size();
    while (i < n) {
        // Skip leading whitespace
        while (i < n && (line[i] == ' ' || line[i] == '\t')) {
            ++i;
        }
        if (i >= n) {
            break;
        }

        std::string arg;
        if (line[i] == '"' || line[i] == '\'') {
            char quote = line[i++];
            bool in_escape = false;

            while (i < n) {
                char c = line[i++];
                if (in_escape) {
                    switch (c) {
                    case 'n': arg.push_back('\n'); break;
                    case 'r': arg.push_back('\r'); break;
                    case 't': arg.push_back('\t'); break;
                    case 'b': arg.push_back('\b'); break;
                    case 'a': arg.push_back('\a'); break;
                    default: arg.push_back(c); break;
                    }
                    in_escape = false;
                } else if (c == '\\' && quote == '"') {
                    in_escape = true;
                } else if (c == quote) {
                    break;
                } else {
                    arg.push_back(c);
                }
            }
        } else {
            // Unquoted token
            while (i < n && line[i] != ' ' && line[i] != '\t' && line[i] != '\r' && line[i] != '\n') {
                arg.push_back(line[i++]);
            }
        }

        args.push_back(std::move(arg));
    }

    if (args.empty()) {
        return core::ErrorCode::ProtocolError;
    }

    return Command(std::move(args));
}

} // namespace redisx::proto
