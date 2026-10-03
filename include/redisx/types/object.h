#ifndef REDISX_TYPES_OBJECT_H
#define REDISX_TYPES_OBJECT_H

#include "redisx/types/intset.h"
#include "redisx/types/listpack.h"
#include "redisx/types/quicklist.h"
#include "redisx/types/skiplist.h"

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <variant>

namespace redisx::types {

enum class ObjectType : std::uint8_t {
    String = 0,
    List,
    Hash,
    Set,
    ZSet
};

enum class Encoding : std::uint8_t {
    Raw = 0,
    Intset,
    Listpack,
    Quicklist,
    Hashtable,
    Skiplist
};

constexpr std::string_view to_string(ObjectType type) noexcept {
    switch (type) {
    case ObjectType::String: return "string";
    case ObjectType::List:   return "list";
    case ObjectType::Hash:   return "hash";
    case ObjectType::Set:    return "set";
    case ObjectType::ZSet:   return "zset";
    }
    return "unknown";
}

constexpr std::string_view to_string(Encoding encoding) noexcept {
    switch (encoding) {
    case Encoding::Raw:       return "raw";
    case Encoding::Intset:    return "intset";
    case Encoding::Listpack:  return "listpack";
    case Encoding::Quicklist: return "quicklist";
    case Encoding::Hashtable: return "hashtable";
    case Encoding::Skiplist:  return "skiplist";
    }
    return "unknown";
}

// Configurable thresholds for encoding promotions
struct ObjectConfig {
    size_t list_max_listpack_entries{64};
    size_t list_max_listpack_value{512};

    size_t hash_max_listpack_entries{512};
    size_t hash_max_listpack_value{64};

    size_t set_max_intset_entries{512};

    size_t zset_max_listpack_entries{128};
    size_t zset_max_listpack_value{64};
};

class Object {
  public:
    // String constructor
    explicit Object(std::string str);

    // Factory methods for collections
    static Object create_list();
    static Object create_hash();
    static Object create_set();
    static Object create_zset();

    ObjectType type() const noexcept { return type_; }
    Encoding encoding() const noexcept { return encoding_; }

    // String operations
    [[nodiscard]] const std::string &as_string() const;
    [[nodiscard]] std::string &as_string();

    // List operations
    void list_push_front(std::string_view value, const ObjectConfig &cfg = {});
    void list_push_back(std::string_view value, const ObjectConfig &cfg = {});
    std::optional<std::string> list_pop_front();
    std::optional<std::string> list_pop_back();
    [[nodiscard]] size_t list_len() const;
    [[nodiscard]] std::vector<std::string> list_range(ptrdiff_t start, ptrdiff_t stop) const;

    // Hash operations
    bool hash_set(std::string_view field, std::string_view value, const ObjectConfig &cfg = {});
    std::optional<std::string> hash_get(std::string_view field) const;
    bool hash_del(std::string_view field);
    [[nodiscard]] size_t hash_len() const;
    [[nodiscard]] std::vector<std::pair<std::string, std::string>> hash_getall() const;

    // Set operations
    bool set_add(std::string_view member, const ObjectConfig &cfg = {});
    bool set_remove(std::string_view member);
    [[nodiscard]] bool set_contains(std::string_view member) const;
    [[nodiscard]] size_t set_len() const;
    [[nodiscard]] std::vector<std::string> set_members() const;

    // ZSet operations
    bool zset_add(double score, std::string_view member, const ObjectConfig &cfg = {});
    bool zset_remove(std::string_view member);
    [[nodiscard]] std::optional<double> zset_score(std::string_view member) const;
    [[nodiscard]] size_t zset_len() const;
    [[nodiscard]] std::vector<std::pair<std::string, double>> zset_range(
        size_t start, size_t stop, bool reverse = false) const;
    [[nodiscard]] std::optional<size_t> zset_rank(std::string_view member) const;

  private:
    ObjectType type_{ObjectType::String};
    Encoding encoding_{Encoding::Raw};

    // Variant representation for efficient storage
    using DataVariant = std::variant<
        std::string,                                        // String (Raw)
        Listpack,                                           // List/Hash/ZSet (Listpack)
        Quicklist,                                          // List (Quicklist)
        Intset,                                             // Set (Intset)
        std::unordered_map<std::string, std::string>,       // Hash (Hashtable)
        std::unordered_set<std::string>,                    // Set (Hashtable)
        Skiplist                                            // ZSet (Skiplist)
    >;

    DataVariant data_;

    void check_list_promotion(const ObjectConfig &cfg);
    void check_hash_promotion(const ObjectConfig &cfg);
    void check_set_promotion(const ObjectConfig &cfg);
    void check_zset_promotion(const ObjectConfig &cfg);
};

} // namespace redisx::types

#endif // REDISX_TYPES_OBJECT_H
