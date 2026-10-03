#include "redisx/types/listpack.h"

namespace redisx::types {

Listpack::Listpack() = default;

void Listpack::push_back(std::string_view elem) {
    elements_.emplace_back(elem);
}

void Listpack::push_front(std::string_view elem) {
    elements_.insert(elements_.begin(), std::string(elem));
}

bool Listpack::insert(size_t index, std::string_view elem) {
    if (index > elements_.size()) {
        return false;
    }
    elements_.insert(elements_.begin() + static_cast<ptrdiff_t>(index), std::string(elem));
    return true;
}

bool Listpack::remove(size_t index) {
    if (index >= elements_.size()) {
        return false;
    }
    elements_.erase(elements_.begin() + static_cast<ptrdiff_t>(index));
    return true;
}

bool Listpack::replace(size_t index, std::string_view elem) {
    if (index >= elements_.size()) {
        return false;
    }
    elements_[index] = std::string(elem);
    return true;
}

std::optional<std::string> Listpack::get(size_t index) const {
    if (index >= elements_.size()) {
        return std::nullopt;
    }
    return elements_[index];
}

size_t Listpack::bytes() const noexcept {
    size_t total = sizeof(Listpack);
    for (const auto &s : elements_) {
        total += s.size() + sizeof(std::string);
    }
    return total;
}

} // namespace redisx::types
