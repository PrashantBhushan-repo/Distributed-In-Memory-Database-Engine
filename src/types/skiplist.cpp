#include "redisx/types/skiplist.h"

#include <cmath>

namespace redisx::types {

Skiplist::Skiplist() {
    header_ = new SkiplistNode(SKIPLIST_MAXLEVEL, 0, "");
    for (int i = 0; i < SKIPLIST_MAXLEVEL; ++i) {
        header_->level[static_cast<size_t>(i)].forward = nullptr;
        header_->level[static_cast<size_t>(i)].span = 0;
    }
    header_->backward = nullptr;
}

Skiplist::~Skiplist() {
    SkiplistNode *node = header_->level[0].forward;
    while (node) {
        SkiplistNode *next = node->level[0].forward;
        delete node;
        node = next;
    }
    delete header_;
}

Skiplist::Skiplist(Skiplist &&other) noexcept
    : header_(other.header_), tail_(other.tail_), length_(other.length_),
      level_(other.level_), dict_(std::move(other.dict_)) {
    other.header_ = new SkiplistNode(SKIPLIST_MAXLEVEL, 0, "");
    other.tail_ = nullptr;
    other.length_ = 0;
    other.level_ = 1;
}

Skiplist &Skiplist::operator=(Skiplist &&other) noexcept {
    if (this != &other) {
        SkiplistNode *node = header_->level[0].forward;
        while (node) {
            SkiplistNode *next = node->level[0].forward;
            delete node;
            node = next;
        }
        delete header_;

        header_ = other.header_;
        tail_ = other.tail_;
        length_ = other.length_;
        level_ = other.level_;
        dict_ = std::move(other.dict_);

        other.header_ = new SkiplistNode(SKIPLIST_MAXLEVEL, 0, "");
        other.tail_ = nullptr;
        other.length_ = 0;
        other.level_ = 1;
    }
    return *this;
}

int Skiplist::random_level() {
    int level = 1;
    std::uniform_real_distribution<double> dist(0.0, 1.0);
    while (dist(rng_) < SKIPLIST_P && level < SKIPLIST_MAXLEVEL) {
        level++;
    }
    return level;
}

bool Skiplist::insert(double score, std::string_view member) {
    std::string mem(member);
    auto dict_it = dict_.find(mem);
    if (dict_it != dict_.end()) {
        double old_score = dict_it->second;
        if (old_score == score) {
            return false; // Score unchanged
        }
        remove(old_score, mem);
    }

    SkiplistNode *update[SKIPLIST_MAXLEVEL];
    size_t rank[SKIPLIST_MAXLEVEL];
    SkiplistNode *x = header_;

    for (int i = level_ - 1; i >= 0; --i) {
        rank[i] = (i == level_ - 1) ? 0 : rank[i + 1];
        while (x->level[static_cast<size_t>(i)].forward &&
               (x->level[static_cast<size_t>(i)].forward->score < score ||
                (x->level[static_cast<size_t>(i)].forward->score == score &&
                 x->level[static_cast<size_t>(i)].forward->member < mem))) {
            rank[i] += x->level[static_cast<size_t>(i)].span;
            x = x->level[static_cast<size_t>(i)].forward;
        }
        update[i] = x;
    }

    int level = random_level();
    if (level > level_) {
        for (int i = level_; i < level; ++i) {
            rank[i] = 0;
            update[i] = header_;
            update[i]->level[static_cast<size_t>(i)].span = length_;
        }
        level_ = level;
    }

    x = new SkiplistNode(level, score, mem);
    for (int i = 0; i < level; ++i) {
        size_t idx = static_cast<size_t>(i);
        x->level[idx].forward = update[i]->level[idx].forward;
        update[i]->level[idx].forward = x;

        x->level[idx].span = update[i]->level[idx].span - (rank[0] - rank[i]);
        update[i]->level[idx].span = (rank[0] - rank[i]) + 1;
    }

    for (int i = level; i < level_; ++i) {
        update[i]->level[static_cast<size_t>(i)].span++;
    }

    x->backward = (update[0] == header_) ? nullptr : update[0];
    if (x->level[0].forward) {
        x->level[0].forward->backward = x;
    } else {
        tail_ = x;
    }

    length_++;
    dict_[mem] = score;
    return true;
}

bool Skiplist::remove(double score, std::string_view member) {
    std::string mem(member);
    SkiplistNode *update[SKIPLIST_MAXLEVEL];
    SkiplistNode *x = header_;

    for (int i = level_ - 1; i >= 0; --i) {
        while (x->level[static_cast<size_t>(i)].forward &&
               (x->level[static_cast<size_t>(i)].forward->score < score ||
                (x->level[static_cast<size_t>(i)].forward->score == score &&
                 x->level[static_cast<size_t>(i)].forward->member < mem))) {
            x = x->level[static_cast<size_t>(i)].forward;
        }
        update[i] = x;
    }

    x = x->level[0].forward;
    if (x && score == x->score && x->member == mem) {
        for (int i = 0; i < level_; ++i) {
            size_t idx = static_cast<size_t>(i);
            if (update[i]->level[idx].forward == x) {
                update[i]->level[idx].span += x->level[idx].span - 1;
                update[i]->level[idx].forward = x->level[idx].forward;
            } else {
                update[i]->level[idx].span -= 1;
            }
        }
        if (x->level[0].forward) {
            x->level[0].forward->backward = x->backward;
        } else {
            tail_ = x->backward;
        }
        while (level_ > 1 && header_->level[static_cast<size_t>(level_ - 1)].forward == nullptr) {
            level_--;
        }
        length_--;
        dict_.erase(mem);
        delete x;
        return true;
    }
    return false;
}

std::optional<double> Skiplist::get_score(std::string_view member) const {
    auto it = dict_.find(std::string(member));
    if (it != dict_.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::optional<size_t> Skiplist::get_rank(double score, std::string_view member) const {
    std::string mem(member);
    SkiplistNode *x = header_;
    size_t rank = 0;

    for (int i = level_ - 1; i >= 0; --i) {
        while (x->level[static_cast<size_t>(i)].forward &&
               (x->level[static_cast<size_t>(i)].forward->score < score ||
                (x->level[static_cast<size_t>(i)].forward->score == score &&
                 x->level[static_cast<size_t>(i)].forward->member <= mem))) {
            rank += x->level[static_cast<size_t>(i)].span;
            x = x->level[static_cast<size_t>(i)].forward;
        }
        if (x && x->member == mem) {
            return rank - 1; // 0-based rank
        }
    }
    return std::nullopt;
}

std::optional<std::pair<std::string, double>> Skiplist::get_element_by_rank(size_t rank) const {
    if (rank >= length_) {
        return std::nullopt;
    }
    SkiplistNode *x = header_;
    size_t traversed = 0;
    size_t target_rank = rank + 1;

    for (int i = level_ - 1; i >= 0; --i) {
        while (x->level[static_cast<size_t>(i)].forward &&
               traversed + x->level[static_cast<size_t>(i)].span <= target_rank) {
            traversed += x->level[static_cast<size_t>(i)].span;
            x = x->level[static_cast<size_t>(i)].forward;
        }
        if (traversed == target_rank) {
            return std::make_pair(x->member, x->score);
        }
    }
    return std::nullopt;
}

std::vector<std::pair<std::string, double>> Skiplist::range_by_score(
    double min_score, double max_score, bool min_inclusive, bool max_inclusive,
    size_t offset, size_t count) const {

    std::vector<std::pair<std::string, double>> result;
    SkiplistNode *x = header_;

    for (int i = level_ - 1; i >= 0; --i) {
        while (x->level[static_cast<size_t>(i)].forward &&
               (min_inclusive ? x->level[static_cast<size_t>(i)].forward->score < min_score
                              : x->level[static_cast<size_t>(i)].forward->score <= min_score)) {
            x = x->level[static_cast<size_t>(i)].forward;
        }
    }

    x = x->level[0].forward;

    size_t skipped = 0;
    while (x && result.size() < count) {
        bool valid_max = max_inclusive ? (x->score <= max_score) : (x->score < max_score);
        if (!valid_max) break;

        if (skipped >= offset) {
            result.emplace_back(x->member, x->score);
        } else {
            skipped++;
        }
        x = x->level[0].forward;
    }

    return result;
}

std::vector<std::pair<std::string, double>> Skiplist::range_by_rank(
    size_t start, size_t stop, bool reverse) const {

    std::vector<std::pair<std::string, double>> result;
    if (length_ == 0) return result;

    if (!reverse) {
        if (start >= length_) return result;
        if (stop >= length_) stop = length_ - 1;
        if (start > stop) return result;

        for (size_t r = start; r <= stop; ++r) {
            auto elem = get_element_by_rank(r);
            if (elem) result.push_back(*elem);
        }
    } else {
        if (start >= length_) return result;
        if (stop >= length_) stop = length_ - 1;
        if (start > stop) return result;

        for (size_t r = start; r <= stop; ++r) {
            size_t actual_rank = length_ - 1 - r;
            auto elem = get_element_by_rank(actual_rank);
            if (elem) result.push_back(*elem);
        }
    }

    return result;
}

size_t Skiplist::count_in_range(double min_score, double max_score,
                                bool min_inclusive, bool max_inclusive) const {
    auto res = range_by_score(min_score, max_score, min_inclusive, max_inclusive);
    return res.size();
}

} // namespace redisx::types
