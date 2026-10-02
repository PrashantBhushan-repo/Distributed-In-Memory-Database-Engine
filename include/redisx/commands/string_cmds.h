#ifndef REDISX_COMMANDS_STRING_CMDS_H
#define REDISX_COMMANDS_STRING_CMDS_H

#include "redisx/commands/dispatcher.h"

namespace redisx::commands {

// Registers all Core & String commands into the dispatcher
void register_string_commands(Dispatcher &dispatcher);

// Glob pattern matching helper for KEYS and SCAN MATCH
bool string_match_glob(std::string_view pattern, std::string_view string, bool ignore_case = false) noexcept;

} // namespace redisx::commands

#endif // REDISX_COMMANDS_STRING_CMDS_H
