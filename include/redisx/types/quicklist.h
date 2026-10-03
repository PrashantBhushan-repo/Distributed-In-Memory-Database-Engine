#ifndef REDISX_TYPES_QUICKLIST_H
#define REDISX_TYPES_QUICKLIST_H

#include "redisx/types/listpack.h"
#include <cstddef>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace redisx::types {

constexpr size_t QUICKLIST_MAX_LISTPACK_SIZE = 512;
constexpr size_t QUICKLIST_MAX_LISTPACK_ENTRIES = 64;

struct QuicklistNode {
    Listpack lp;
    QuicklistNode *prev{nullptr};
    QuicklistNode *next{nullptr};
};

class Quicklist {
  public:
    Quicklist() = default;
    ~Quicklist();

    Quicklist(const Quicklist &) = delete;
    Quicklist &operator=(const Quicklist &) = delete;
    Quicklist(Quicklist &&other) noexcept;
    Quicklist &operator=(Quicklist &&other) noexcept;

    void push_front(std::string_view value);
    void push_back(std::string_view value);

    std::optional<std::string> pop_front();
    std::optional<std::string> pop_back();

    [[nodiscard]] std::optional<std::string> get(ptrdiff_t index) const;
    bool set(ptrdiff_t index, std::string_view value);

    size_t remove(ptrdiff_t count, std::string_view value);
    bool trim(ptrdiff_t start, ptrdiff_t stop);

    [[nodiscard]] std::vector<std::string> range(ptrdiff_t start, ptrdiff_t stop) const;

    [[nodiscard]] size_t len() const noexcept { return count_; }
    [[nodiscard]] bool empty() const noexcept { return count_ == 0; }

  private:
    QuicklistNode *head_{nullptr};
    QuicklistNode *tail_{nullptr};
    size_t count_{0};
    size_t node_count_{0};

    ptrdiff_t normalize_index(ptrdiff_t index) const noexcept;
};

} // namespace redisx::types

#endif // REDISX_TYPES_QUICKLIST_H
