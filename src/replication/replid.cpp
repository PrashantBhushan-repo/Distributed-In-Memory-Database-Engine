#include "redisx/replication/replid.h"

#include <random>
#include <sstream>
#include <iomanip>

namespace redisx::replication {

std::string ReplIdManager::generate_random_replid() {
    static const char hex_chars[] = "0123456789abcdef";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);

    std::string id;
    id.reserve(40);
    for (int i = 0; i < 40; ++i) {
        id.push_back(hex_chars[dis(gen)]);
    }
    return id;
}

ReplIdManager::ReplIdManager()
    : master_replid_(generate_random_replid()),
      master_repl_offset_(0),
      replid2_(40, '0'),
      second_replid_offset_(-1) {}

void ReplIdManager::shift_replid(const std::string &new_replid) {
    replid2_ = master_replid_;
    second_replid_offset_ = static_cast<std::int64_t>(master_repl_offset_);
    master_replid_ = new_replid;
}

} // namespace redisx::replication
