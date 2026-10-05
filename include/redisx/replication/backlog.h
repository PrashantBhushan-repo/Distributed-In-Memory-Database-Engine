#ifndef REDISX_REPLICATION_BACKLOG_H
#define REDISX_REPLICATION_BACKLOG_H

#include "redisx/replication/replid.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace redisx::replication {

class ReplBacklog {
  public:
    explicit ReplBacklog(std::size_t capacity = 1024 * 1024); // Default 1 MB

    void write(const void *data, std::size_t len, ReplIdManager &replid_mgr);
    void write(const std::string &str, ReplIdManager &replid_mgr);

    [[nodiscard]] bool can_partial_resync(
        const std::string &req_replid,
        std::uint64_t req_offset,
        const ReplIdManager &replid_mgr
    ) const noexcept;

    [[nodiscard]] std::string get_bytes_from_offset(std::uint64_t req_offset) const;

    [[nodiscard]] std::size_t capacity() const noexcept { return capacity_; }
    [[nodiscard]] std::size_t histlen() const noexcept { return histlen_; }
    [[nodiscard]] std::uint64_t first_byte_offset() const noexcept { return first_byte_offset_; }

  private:
    std::size_t capacity_;
    std::vector<char> buffer_;
    std::size_t write_idx_{0};
    std::size_t histlen_{0};
    std::uint64_t first_byte_offset_{0};
};

} // namespace redisx::replication

#endif // REDISX_REPLICATION_BACKLOG_H
