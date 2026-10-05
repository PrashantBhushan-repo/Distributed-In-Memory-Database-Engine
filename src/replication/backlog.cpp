#include "redisx/replication/backlog.h"

#include <algorithm>
#include <cstring>

namespace redisx::replication {

ReplBacklog::ReplBacklog(std::size_t capacity)
    : capacity_(capacity > 0 ? capacity : 1024 * 1024),
      buffer_(capacity_, 0) {}

void ReplBacklog::write(const void *data, std::size_t len, ReplIdManager &replid_mgr) {
    if (len == 0) return;

    const char *ptr = static_cast<const char *>(data);

    for (std::size_t i = 0; i < len; ++i) {
        buffer_[write_idx_] = ptr[i];
        write_idx_ = (write_idx_ + 1) % capacity_;

        if (histlen_ < capacity_) {
            histlen_++;
        } else {
            // Buffer full, advancing first byte offset
            first_byte_offset_++;
        }
    }

    replid_mgr.add_offset(len);
    if (first_byte_offset_ == 0 && histlen_ > 0) {
        first_byte_offset_ = 1;
    }
}

void ReplBacklog::write(const std::string &str, ReplIdManager &replid_mgr) {
    write(str.data(), str.size(), replid_mgr);
}

bool ReplBacklog::can_partial_resync(
    const std::string &req_replid,
    std::uint64_t req_offset,
    const ReplIdManager &replid_mgr
) const noexcept {
    bool replid_matches = false;
    if (req_replid == replid_mgr.master_replid()) {
        replid_matches = true;
    } else if (req_replid == replid_mgr.replid2() &&
               replid_mgr.second_replid_offset() >= 0 &&
               req_offset <= static_cast<std::uint64_t>(replid_mgr.second_replid_offset())) {
        replid_matches = true;
    }

    if (!replid_matches) return false;

    std::uint64_t current_offset = replid_mgr.master_repl_offset();
    if (histlen_ == 0) {
        return req_offset == current_offset + 1;
    }

    return req_offset >= first_byte_offset_ && req_offset <= current_offset + 1;
}

std::string ReplBacklog::get_bytes_from_offset(std::uint64_t req_offset) const {
    if (histlen_ == 0 || req_offset < first_byte_offset_) {
        return "";
    }

    std::uint64_t offset_diff = req_offset - first_byte_offset_;
    if (offset_diff >= histlen_) {
        return "";
    }

    std::size_t bytes_to_read = histlen_ - static_cast<std::size_t>(offset_diff);
    std::size_t start_idx = (write_idx_ + capacity_ - histlen_ + static_cast<std::size_t>(offset_diff)) % capacity_;

    std::string result;
    result.reserve(bytes_to_read);

    for (std::size_t i = 0; i < bytes_to_read; ++i) {
        result.push_back(buffer_[(start_idx + i) % capacity_]);
    }

    return result;
}

} // namespace redisx::replication
