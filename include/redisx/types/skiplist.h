#ifndef REDISX_TYPES_SKIPLIST_H
#define REDISX_TYPES_SKIPLIST_H

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <random>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace redisx::types {

constexpr int SKIPLIST_MAXLEVEL = 32;
constexpr double SKIPLIST_P = 0.25;

struct SkiplistLevel {
    struct SkiplistNode *forward{nullptr};
    size_t span{0};
};

struct SkiplistNode {
    std::string member;
    double score{0.0};
    SkiplistNode *backward{nullptr};
    std::vector<SkiplistLevel> level;

    SkiplistNode(int level_count, double s, std::string m)
        : member(std::move(m)), score(s), level(static_cast<size_t>(level_count)) {}
};

class Skiplist {
  public:
    Skiplist();
    ~Skiplist();

    Skiplist(const Skiplist &) = delete;
    Skiplist &operator=(const Skiplist &) = delete;
    Skiplist(Skiplist &&other) noexcept;
    Skiplist &operator=(Skiplist &&other) noexcept;

    // Returns true if inserted, false if score updated
    bool insert(double score, std::string_view member);
    bool remove(double score, std::string_view member);
    [[nodiscard]] std::optional<double> get_score(std::string_view member) const;

    [[nodiscard]] std::optional<size_t> get_rank(double score, std::string_view member) const;
    [[nodiscard]] std::optional<std::pair<std::string, double>> get_element_by_rank(size_t rank) const;

    [[nodiscard]] std::vector<std::pair<std::string, double>> range_by_score(
        double min_score, double max_score, bool min_inclusive = true, bool max_inclusive = true,
        size_t offset = 0, size_t count = SIZE_MAX) const;

    [[nodiscard]] std::vector<std::pair<std::string, double>> range_by_rank(
        size_t start, size_t stop, bool reverse = false) const;

    [[nodiscard]] size_t count_in_range(double min_score, double max_score,
                                        bool min_inclusive = true, bool max_inclusive = true) const;

    [[nodiscard]] size_t size() const noexcept { return length_; }
    [[nodiscard]] bool empty() const noexcept { return length_ == 0; }

  private:
    SkiplistNode *header_{nullptr};
    SkiplistNode *tail_{nullptr};
    size_t length_{0};
    int level_{1};
    std::unordered_map<std::string, double> dict_;
    mutable std::mt19937 rng_{std::random_device{}()};

    int random_level();
    void free_node(SkiplistNode *node);
};

} // namespace redisx::types

#endif // REDISX_TYPES_SKIPLIST_H
