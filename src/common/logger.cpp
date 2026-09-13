#include "PBRedisDB/common/logger.hpp"

#include <iostream>
#include <mutex>
#include <string_view>

namespace {

using std::cout;
using std::lock_guard;
using std::mutex;
using std::string_view;

mutex log_mutex;

void log_message(
	string_view level,
	string_view message
) {
	lock_guard<mutex> lock(log_mutex);

	cout
		<< "["
		<< level
		<< "] "
		<< message
		<< '\n';
}

}  // namespace

namespace PBRedisDB::common {

void info(string_view message) {
	log_message("INFO", message);
}

void warn(string_view message) {
	log_message("WARN", message);
}

void error(string_view message) {
	log_message("ERROR", message);
}

}  // namespace PBRedisDB::common