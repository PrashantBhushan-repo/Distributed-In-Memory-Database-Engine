#ifndef REDISX_REPLICATION_REPLID_H
#define REDISX_REPLICATION_REPLID_H

#include <cstdint>
#include <string>

namespace redisx::replication {

class ReplIdManager {
  public:
    ReplIdManager();

    [[nodiscard]] const std::string &master_replid() const noexcept { return master_replid_; }
    [[nodiscard]] std::uint64_t master_repl_offset() const noexcept { return master_repl_offset_; }
    [[nodiscard]] const std::string &replid2() const noexcept { return replid2_; }
    [[nodiscard]] std::int64_t second_replid_offset() const noexcept { return second_replid_offset_; }

    void add_offset(std::uint64_t bytes) noexcept { master_repl_offset_ += bytes; }
    void set_offset(std::uint64_t offset) noexcept { master_repl_offset_ = offset; }

    void set_master_replid(const std::string &id) { master_replid_ = id; }
    void shift_replid(const std::string &new_replid);

    static std::string generate_random_replid();

  private:
    std::string master_replid_;
    std::uint64_t master_repl_offset_{0};
    std::string replid2_;
    std::int64_t second_replid_offset_{-1};
};

} // namespace redisx::replication

#endif // REDISX_REPLICATION_REPLID_H
