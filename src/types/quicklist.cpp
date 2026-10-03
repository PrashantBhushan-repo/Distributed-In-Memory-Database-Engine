#include "redisx/types/quicklist.h"

namespace redisx::types {

Quicklist::~Quicklist() {
    QuicklistNode *curr = head_;
    while (curr) {
        QuicklistNode *next = curr->next;
        delete curr;
        curr = next;
    }
}

Quicklist::Quicklist(Quicklist &&other) noexcept
    : head_(other.head_), tail_(other.tail_), count_(other.count_), node_count_(other.node_count_) {
    other.head_ = nullptr;
    other.tail_ = nullptr;
    other.count_ = 0;
    other.node_count_ = 0;
}

Quicklist &Quicklist::operator=(Quicklist &&other) noexcept {
    if (this != &other) {
        QuicklistNode *curr = head_;
        while (curr) {
            QuicklistNode *next = curr->next;
            delete curr;
            curr = next;
        }

        head_ = other.head_;
        tail_ = other.tail_;
        count_ = other.count_;
        node_count_ = other.node_count_;

        other.head_ = nullptr;
        other.tail_ = nullptr;
        other.count_ = 0;
        other.node_count_ = 0;
    }
    return *this;
}

void Quicklist::push_front(std::string_view value) {
    if (!head_ || head_->lp.size() >= QUICKLIST_MAX_LISTPACK_ENTRIES ||
        head_->lp.bytes() >= QUICKLIST_MAX_LISTPACK_SIZE) {
        auto *new_node = new QuicklistNode();
        new_node->lp.push_front(value);
        new_node->next = head_;
        if (head_) head_->prev = new_node;
        head_ = new_node;
        if (!tail_) tail_ = head_;
        node_count_++;
    } else {
        head_->lp.push_front(value);
    }
    count_++;
}

void Quicklist::push_back(std::string_view value) {
    if (!tail_ || tail_->lp.size() >= QUICKLIST_MAX_LISTPACK_ENTRIES ||
        tail_->lp.bytes() >= QUICKLIST_MAX_LISTPACK_SIZE) {
        auto *new_node = new QuicklistNode();
        new_node->lp.push_back(value);
        new_node->prev = tail_;
        if (tail_) tail_->next = new_node;
        tail_ = new_node;
        if (!head_) head_ = tail_;
        node_count_++;
    } else {
        tail_->lp.push_back(value);
    }
    count_++;
}

std::optional<std::string> Quicklist::pop_front() {
    if (!head_) return std::nullopt;
    auto val = head_->lp.get(0);
    if (!val) return std::nullopt;

    head_->lp.remove(0);
    count_--;

    if (head_->lp.empty()) {
        QuicklistNode *next = head_->next;
        delete head_;
        head_ = next;
        if (head_) head_->prev = nullptr;
        else tail_ = nullptr;
        node_count_--;
    }
    return val;
}

std::optional<std::string> Quicklist::pop_back() {
    if (!tail_) return std::nullopt;
    size_t last_idx = tail_->lp.size() - 1;
    auto val = tail_->lp.get(last_idx);
    if (!val) return std::nullopt;

    tail_->lp.remove(last_idx);
    count_--;

    if (tail_->lp.empty()) {
        QuicklistNode *prev = tail_->prev;
        delete tail_;
        tail_ = prev;
        if (tail_) tail_->next = nullptr;
        else head_ = nullptr;
        node_count_--;
    }
    return val;
}

ptrdiff_t Quicklist::normalize_index(ptrdiff_t index) const noexcept {
    if (count_ == 0) return -1;
    if (index < 0) {
        index = static_cast<ptrdiff_t>(count_) + index;
    }
    if (index < 0 || index >= static_cast<ptrdiff_t>(count_)) {
        return -1;
    }
    return index;
}

std::optional<std::string> Quicklist::get(ptrdiff_t index) const {
    ptrdiff_t idx = normalize_index(index);
    if (idx < 0) return std::nullopt;

    QuicklistNode *curr = head_;
    size_t accumulated = 0;
    while (curr) {
        size_t sz = curr->lp.size();
        if (static_cast<size_t>(idx) < accumulated + sz) {
            return curr->lp.get(static_cast<size_t>(idx) - accumulated);
        }
        accumulated += sz;
        curr = curr->next;
    }
    return std::nullopt;
}

bool Quicklist::set(ptrdiff_t index, std::string_view value) {
    ptrdiff_t idx = normalize_index(index);
    if (idx < 0) return false;

    QuicklistNode *curr = head_;
    size_t accumulated = 0;
    while (curr) {
        size_t sz = curr->lp.size();
        if (static_cast<size_t>(idx) < accumulated + sz) {
            return curr->lp.replace(static_cast<size_t>(idx) - accumulated, value);
        }
        accumulated += sz;
        curr = curr->next;
    }
    return false;
}

std::vector<std::string> Quicklist::range(ptrdiff_t start, ptrdiff_t stop) const {
    std::vector<std::string> result;
    if (count_ == 0) return result;

    if (start < 0) start = static_cast<ptrdiff_t>(count_) + start;
    if (stop < 0) stop = static_cast<ptrdiff_t>(count_) + stop;

    if (start < 0) start = 0;
    if (stop >= static_cast<ptrdiff_t>(count_)) stop = static_cast<ptrdiff_t>(count_) - 1;

    if (start > stop || start >= static_cast<ptrdiff_t>(count_)) return result;

    for (ptrdiff_t i = start; i <= stop; ++i) {
        auto val = get(i);
        if (val) result.push_back(std::move(*val));
    }

    return result;
}

size_t Quicklist::remove(ptrdiff_t count, std::string_view value) {
    size_t removed = 0;
    std::vector<std::string> new_elements;

    for (size_t i = 0; i < count_; ++i) {
        auto val = get(static_cast<ptrdiff_t>(i));
        if (val) {
            if (*val == value && (count == 0 || removed < static_cast<size_t>(std::abs(count)))) {
                removed++;
            } else {
                new_elements.push_back(std::move(*val));
            }
        }
    }

    if (removed > 0) {
        QuicklistNode *curr = head_;
        while (curr) {
            QuicklistNode *next = curr->next;
            delete curr;
            curr = next;
        }
        head_ = nullptr;
        tail_ = nullptr;
        count_ = 0;
        node_count_ = 0;

        for (const auto &elem : new_elements) {
            push_back(elem);
        }
    }

    return removed;
}

bool Quicklist::trim(ptrdiff_t start, ptrdiff_t stop) {
    if (count_ == 0) return true;

    if (start < 0) start = static_cast<ptrdiff_t>(count_) + start;
    if (stop < 0) stop = static_cast<ptrdiff_t>(count_) + stop;

    if (start < 0) start = 0;
    if (stop >= static_cast<ptrdiff_t>(count_)) stop = static_cast<ptrdiff_t>(count_) - 1;

    if (start > stop || start >= static_cast<ptrdiff_t>(count_)) {
        QuicklistNode *curr = head_;
        while (curr) {
            QuicklistNode *next = curr->next;
            delete curr;
            curr = next;
        }
        head_ = nullptr;
        tail_ = nullptr;
        count_ = 0;
        node_count_ = 0;
        return true;
    }

    auto trimmed = range(start, stop);

    QuicklistNode *curr = head_;
    while (curr) {
        QuicklistNode *next = curr->next;
        delete curr;
        curr = next;
    }
    head_ = nullptr;
    tail_ = nullptr;
    count_ = 0;
    node_count_ = 0;

    for (const auto &elem : trimmed) {
        push_back(elem);
    }

    return true;
}

} // namespace redisx::types
