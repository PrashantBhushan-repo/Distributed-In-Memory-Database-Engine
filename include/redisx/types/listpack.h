#ifndef REDISX_TYPES_LISTPACK_H
#define REDISX_TYPES_LISTPACK_H

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace redisx::types {

// Listpack stores small collections in one contiguous byte buffer (RedisX internal format).
// Elements can be stored as variable-length strings or encoded integers.
class Listpack {
  public:
    Listpack();
    ~Listpack() = default;

    Listpack(const Listpack &) = default;
    Listpack &operator=(const Listpack &) = default;
    Listpack(Listpack &&) noexcept = default;
    Listpack &operator=(Listpack &&) noexcept = default;

    void push_back(std::string_view elem);
    void push_front(std::string_view elem);
    bool insert(size_t index, std::string_view elem);
    bool remove(size_t index);
    bool replace(size_t index, std::string_view elem);

    [[nodiscard]] std::optional<std::string> get(size_t index) const;
    [[nodiscard]] size_t size() const noexcept { return count_; }
    [[nodiscard]] size_t bytes() const noexcept;
    [[nodiscard]] bool empty() const noexcept { return count_ == 0; }

    [[nodiscard]] std::vector<std::string> to_vector() const;
    void clear() { data_.clear(); count_ = 0; }

  private:
    std::vector<std::uint8_t> data_;
    std::size_t count_{0};
    [[nodiscard]] std::size_t offset(std::size_t index) const;
    [[nodiscard]] std::pair<std::string, std::size_t> decode(std::size_t offset) const;
};

} // namespace redisx::types

#endif // REDISX_TYPES_LISTPACK_H
