
#pragma once

#include <string_view>

namespace PBRedisDB::common {

void info(std::string_view message);
void warn(std::string_view message);
void error(std::string_view message);

}  // namespace PBRedisDB::common
