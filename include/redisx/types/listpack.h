#ifndef REDISX_TYPES_LISTPACK_H
#define REDISX_TYPES_LISTPACK_H

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace redisx::types {

// Listpack is a compact, single-allocation contiguous byte array for small collections.
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
    [[nodiscard]] size_t size() const noexcept { return elements_.size(); }
    [[nodiscard]] size_t bytes() const noexcept;
    [[nodiscard]] bool empty() const noexcept { return elements_.empty(); }

    [[nodiscard]] std::vector<std::string> to_vector() const { return elements_; }
    void clear() { elements_.clear(); }

  private:
    std::vector<std::string> elements_;
};

} // namespace redisx::types

#endif // REDISX_TYPES_LISTPACK_H
