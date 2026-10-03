#include "redisx/types/object.h"
#include <stdexcept>

namespace redisx::types {

Object::Object(std::string str)
    : type_(ObjectType::String), encoding_(Encoding::Raw), data_(std::move(str)) {}

Object Object::create_list() {
    Object obj("");
    obj.type_ = ObjectType::List;
    obj.encoding_ = Encoding::Listpack;
    obj.data_ = Listpack{};
    return obj;
}

Object Object::create_hash() {
    Object obj("");
    obj.type_ = ObjectType::Hash;
    obj.encoding_ = Encoding::Listpack;
    obj.data_ = Listpack{};
    return obj;
}

Object Object::create_set() {
    Object obj("");
    obj.type_ = ObjectType::Set;
    obj.encoding_ = Encoding::Intset;
    obj.data_ = Intset{};
    return obj;
}

Object Object::create_zset() {
    Object obj("");
    obj.type_ = ObjectType::ZSet;
    obj.encoding_ = Encoding::Listpack;
    obj.data_ = Listpack{};
    return obj;
}

const std::string &Object::as_string() const {
    return std::get<std::string>(data_);
}

std::string &Object::as_string() {
    return std::get<std::string>(data_);
}

// -----------------------------------------------------------------------------
// List Operations & Promotion
// -----------------------------------------------------------------------------

void Object::check_list_promotion(const ObjectConfig &cfg) {
    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        bool promote = lp.size() > cfg.list_max_listpack_entries || lp.bytes() > cfg.list_max_listpack_value;
        if (promote) {
            Quicklist ql;
            for (const auto &elem : lp.to_vector()) {
                ql.push_back(elem);
            }
            data_ = std::move(ql);
            encoding_ = Encoding::Quicklist;
        }
    }
}

void Object::list_push_front(std::string_view value, const ObjectConfig &cfg) {
    if (type_ != ObjectType::List) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        std::get<Listpack>(data_).push_front(value);
        check_list_promotion(cfg);
    } else {
        std::get<Quicklist>(data_).push_front(value);
    }
}

void Object::list_push_back(std::string_view value, const ObjectConfig &cfg) {
    if (type_ != ObjectType::List) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        std::get<Listpack>(data_).push_back(value);
        check_list_promotion(cfg);
    } else {
        std::get<Quicklist>(data_).push_back(value);
    }
}

std::optional<std::string> Object::list_pop_front() {
    if (type_ != ObjectType::List) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        auto res = lp.get(0);
        if (res) lp.remove(0);
        return res;
    } else {
        return std::get<Quicklist>(data_).pop_front();
    }
}

std::optional<std::string> Object::list_pop_back() {
    if (type_ != ObjectType::List) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        if (lp.empty()) return std::nullopt;
        size_t idx = lp.size() - 1;
        auto res = lp.get(idx);
        if (res) lp.remove(idx);
        return res;
    } else {
        return std::get<Quicklist>(data_).pop_back();
    }
}

size_t Object::list_len() const {
    if (type_ != ObjectType::List) return 0;
    if (encoding_ == Encoding::Listpack) {
        return std::get<Listpack>(data_).size();
    } else {
        return std::get<Quicklist>(data_).len();
    }
}

std::vector<std::string> Object::list_range(ptrdiff_t start, ptrdiff_t stop) const {
    if (type_ != ObjectType::List) return {};

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        size_t count = lp.size();
        if (count == 0) return {};

        if (start < 0) start = static_cast<ptrdiff_t>(count) + start;
        if (stop < 0) stop = static_cast<ptrdiff_t>(count) + stop;

        if (start < 0) start = 0;
        if (stop >= static_cast<ptrdiff_t>(count)) stop = static_cast<ptrdiff_t>(count) - 1;

        if (start > stop || start >= static_cast<ptrdiff_t>(count)) return {};

        std::vector<std::string> res;
        for (ptrdiff_t i = start; i <= stop; ++i) {
            auto val = lp.get(static_cast<size_t>(i));
            if (val) res.push_back(*val);
        }
        return res;
    } else {
        return std::get<Quicklist>(data_).range(start, stop);
    }
}

// -----------------------------------------------------------------------------
// Hash Operations & Promotion
// -----------------------------------------------------------------------------

void Object::check_hash_promotion(const ObjectConfig &cfg) {
    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        bool promote = pairs > cfg.hash_max_listpack_entries;
        if (!promote) {
            for (size_t i = 0; i < lp.size(); ++i) {
                auto s = lp.get(i);
                if (s && s->size() > cfg.hash_max_listpack_value) {
                    promote = true;
                    break;
                }
            }
        }
        if (promote) {
            std::unordered_map<std::string, std::string> ht;
            for (size_t i = 0; i < pairs; ++i) {
                auto k = lp.get(i * 2);
                auto v = lp.get(i * 2 + 1);
                if (k && v) ht[*k] = *v;
            }
            data_ = std::move(ht);
            encoding_ = Encoding::Hashtable;
        }
    }
}

bool Object::hash_set(std::string_view field, std::string_view value, const ObjectConfig &cfg) {
    if (type_ != ObjectType::Hash) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto k = lp.get(i * 2);
            if (k && *k == field) {
                lp.replace(i * 2 + 1, value);
                check_hash_promotion(cfg);
                return false; // Updated existing field
            }
        }
        lp.push_back(field);
        lp.push_back(value);
        check_hash_promotion(cfg);
        return true; // Created new field
    } else {
        auto &ht = std::get<std::unordered_map<std::string, std::string>>(data_);
        auto res = ht.emplace(std::string(field), std::string(value));
        if (!res.second) {
            res.first->second = std::string(value);
            return false;
        }
        return true;
    }
}

std::optional<std::string> Object::hash_get(std::string_view field) const {
    if (type_ != ObjectType::Hash) return std::nullopt;

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto k = lp.get(i * 2);
            if (k && *k == field) {
                return lp.get(i * 2 + 1);
            }
        }
        return std::nullopt;
    } else {
        const auto &ht = std::get<std::unordered_map<std::string, std::string>>(data_);
        auto it = ht.find(std::string(field));
        if (it != ht.end()) return it->second;
        return std::nullopt;
    }
}

bool Object::hash_del(std::string_view field) {
    if (type_ != ObjectType::Hash) return false;

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto k = lp.get(i * 2);
            if (k && *k == field) {
                lp.remove(i * 2 + 1);
                lp.remove(i * 2);
                return true;
            }
        }
        return false;
    } else {
        auto &ht = std::get<std::unordered_map<std::string, std::string>>(data_);
        return ht.erase(std::string(field)) > 0;
    }
}

size_t Object::hash_len() const {
    if (type_ != ObjectType::Hash) return 0;

    if (encoding_ == Encoding::Listpack) {
        return std::get<Listpack>(data_).size() / 2;
    } else {
        return std::get<std::unordered_map<std::string, std::string>>(data_).size();
    }
}

std::vector<std::pair<std::string, std::string>> Object::hash_getall() const {
    std::vector<std::pair<std::string, std::string>> res;
    if (type_ != ObjectType::Hash) return res;

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto k = lp.get(i * 2);
            auto v = lp.get(i * 2 + 1);
            if (k && v) res.emplace_back(*k, *v);
        }
    } else {
        const auto &ht = std::get<std::unordered_map<std::string, std::string>>(data_);
        for (const auto &[k, v] : ht) {
            res.emplace_back(k, v);
        }
    }
    return res;
}

// -----------------------------------------------------------------------------
// Set Operations & Promotion
// -----------------------------------------------------------------------------

void Object::check_set_promotion(const ObjectConfig &cfg) {
    if (encoding_ == Encoding::Intset) {
        auto &is = std::get<Intset>(data_);
        if (is.size() > cfg.set_max_intset_entries) {
            std::unordered_set<std::string> ht;
            for (auto val : is.values()) {
                ht.insert(std::to_string(val));
            }
            data_ = std::move(ht);
            encoding_ = Encoding::Hashtable;
        }
    }
}

bool Object::set_add(std::string_view member, const ObjectConfig &cfg) {
    if (type_ != ObjectType::Set) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Intset) {
        int64_t ival = 0;
        if (Intset::is_valid_integer(std::string(member), ival)) {
            auto &is = std::get<Intset>(data_);
            bool added = is.add(ival);
            check_set_promotion(cfg);
            return added;
        } else {
            // Upgrade to Hashtable because member is not an integer
            std::unordered_set<std::string> ht;
            for (auto val : std::get<Intset>(data_).values()) {
                ht.insert(std::to_string(val));
            }
            ht.insert(std::string(member));
            data_ = std::move(ht);
            encoding_ = Encoding::Hashtable;
            return true;
        }
    } else {
        auto &ht = std::get<std::unordered_set<std::string>>(data_);
        return ht.insert(std::string(member)).second;
    }
}

bool Object::set_remove(std::string_view member) {
    if (type_ != ObjectType::Set) return false;

    if (encoding_ == Encoding::Intset) {
        int64_t ival = 0;
        if (Intset::is_valid_integer(std::string(member), ival)) {
            return std::get<Intset>(data_).remove(ival);
        }
        return false;
    } else {
        return std::get<std::unordered_set<std::string>>(data_).erase(std::string(member)) > 0;
    }
}

bool Object::set_contains(std::string_view member) const {
    if (type_ != ObjectType::Set) return false;

    if (encoding_ == Encoding::Intset) {
        int64_t ival = 0;
        if (Intset::is_valid_integer(std::string(member), ival)) {
            return std::get<Intset>(data_).contains(ival);
        }
        return false;
    } else {
        const auto &ht = std::get<std::unordered_set<std::string>>(data_);
        return ht.find(std::string(member)) != ht.end();
    }
}

size_t Object::set_len() const {
    if (type_ != ObjectType::Set) return 0;

    if (encoding_ == Encoding::Intset) {
        return std::get<Intset>(data_).size();
    } else {
        return std::get<std::unordered_set<std::string>>(data_).size();
    }
}

std::vector<std::string> Object::set_members() const {
    std::vector<std::string> res;
    if (type_ != ObjectType::Set) return res;

    if (encoding_ == Encoding::Intset) {
        for (auto val : std::get<Intset>(data_).values()) {
            res.push_back(std::to_string(val));
        }
    } else {
        for (const auto &m : std::get<std::unordered_set<std::string>>(data_)) {
            res.push_back(m);
        }
    }
    return res;
}

// -----------------------------------------------------------------------------
// ZSet Operations & Promotion
// -----------------------------------------------------------------------------

void Object::check_zset_promotion(const ObjectConfig &cfg) {
    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        bool promote = pairs > cfg.zset_max_listpack_entries;
        if (!promote) {
            for (size_t i = 0; i < pairs; ++i) {
                auto m = lp.get(i * 2);
                if (m && m->size() > cfg.zset_max_listpack_value) {
                    promote = true;
                    break;
                }
            }
        }
        if (promote) {
            Skiplist zs;
            for (size_t i = 0; i < pairs; ++i) {
                auto m = lp.get(i * 2);
                auto s_str = lp.get(i * 2 + 1);
                if (m && s_str) {
                    double sc = std::stod(*s_str);
                    zs.insert(sc, *m);
                }
            }
            data_ = std::move(zs);
            encoding_ = Encoding::Skiplist;
        }
    }
}

bool Object::zset_add(double score, std::string_view member, const ObjectConfig &cfg) {
    if (type_ != ObjectType::ZSet) throw std::runtime_error("WRONGTYPE");

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto m = lp.get(i * 2);
            if (m && *m == member) {
                lp.replace(i * 2 + 1, std::to_string(score));
                check_zset_promotion(cfg);
                return false; // Updated score
            }
        }
        lp.push_back(member);
        lp.push_back(std::to_string(score));
        check_zset_promotion(cfg);
        return true; // Added new member
    } else {
        return std::get<Skiplist>(data_).insert(score, member);
    }
}

bool Object::zset_remove(std::string_view member) {
    if (type_ != ObjectType::ZSet) return false;

    if (encoding_ == Encoding::Listpack) {
        auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto m = lp.get(i * 2);
            if (m && *m == member) {
                lp.remove(i * 2 + 1);
                lp.remove(i * 2);
                return true;
            }
        }
        return false;
    } else {
        auto &zs = std::get<Skiplist>(data_);
        auto sc = zs.get_score(member);
        if (sc) {
            return zs.remove(*sc, member);
        }
        return false;
    }
}

std::optional<double> Object::zset_score(std::string_view member) const {
    if (type_ != ObjectType::ZSet) return std::nullopt;

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto m = lp.get(i * 2);
            if (m && *m == member) {
                auto s_str = lp.get(i * 2 + 1);
                if (s_str) return std::stod(*s_str);
            }
        }
        return std::nullopt;
    } else {
        return std::get<Skiplist>(data_).get_score(member);
    }
}

size_t Object::zset_len() const {
    if (type_ != ObjectType::ZSet) return 0;

    if (encoding_ == Encoding::Listpack) {
        return std::get<Listpack>(data_).size() / 2;
    } else {
        return std::get<Skiplist>(data_).size();
    }
}

std::vector<std::pair<std::string, double>> Object::zset_range(
    size_t start, size_t stop, bool reverse) const {

    std::vector<std::pair<std::string, double>> res;
    if (type_ != ObjectType::ZSet) return res;

    size_t length = zset_len();
    if (length == 0) return res;

    if (start >= length) return res;
    if (stop >= length) stop = length - 1;
    if (start > stop) return res;

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        std::vector<std::pair<std::string, double>> vec;
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto m = lp.get(i * 2);
            auto s_str = lp.get(i * 2 + 1);
            if (m && s_str) {
                vec.emplace_back(*m, std::stod(*s_str));
            }
        }

        if (reverse) {
            for (size_t r = start; r <= stop; ++r) {
                size_t idx = length - 1 - r;
                res.push_back(vec[idx]);
            }
        } else {
            for (size_t r = start; r <= stop; ++r) {
                res.push_back(vec[r]);
            }
        }
    } else {
        res = std::get<Skiplist>(data_).range_by_rank(start, stop, reverse);
    }

    return res;
}

std::optional<size_t> Object::zset_rank(std::string_view member) const {
    if (type_ != ObjectType::ZSet) return std::nullopt;

    if (encoding_ == Encoding::Listpack) {
        const auto &lp = std::get<Listpack>(data_);
        size_t pairs = lp.size() / 2;
        for (size_t i = 0; i < pairs; ++i) {
            auto m = lp.get(i * 2);
            if (m && *m == member) {
                return i;
            }
        }
        return std::nullopt;
    } else {
        auto sc = zset_score(member);
        if (sc) {
            return std::get<Skiplist>(data_).get_rank(*sc, member);
        }
        return std::nullopt;
    }
}

} // namespace redisx::types
