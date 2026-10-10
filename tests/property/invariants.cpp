#include "redisx/commands/dispatcher.h"
#include "redisx/commands/string_cmds.h"
#include "redisx/commands/list_cmds.h"
#include "redisx/commands/hash_cmds.h"
#include "redisx/commands/set_cmds.h"
#include "redisx/commands/zset_cmds.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/proto/resp_reader.h"
#include "redisx/proto/resp_writer.h"

#include <gtest/gtest.h>

#include <algorithm>
#include <deque>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <random>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace redisx::property {

static void format_cmd(core::Buffer &buf, const std::vector<std::string> &args) {
    std::string s = "*" + std::to_string(args.size()) + "\r\n";
    for (const auto &a : args) {
        s += "$" + std::to_string(a.size()) + "\r\n" + a + "\r\n";
    }
    buf.append(s.data(), s.size());
}

// In-memory reference oracle using standard C++ containers
class ReferenceModel {
  public:
    enum class Type { None, String, List, Hash, Set, ZSet };

    struct Reply {
        enum class Kind { SimpleString, Error, Integer, BulkString, NullBulk, Array };
        Kind kind{Kind::SimpleString};
        std::string str_val;
        int64_t int_val{0};
        std::vector<Reply> array_val;

        Reply() = default;
        Reply(Kind k, std::string s = "", int64_t i = 0, std::vector<Reply> arr = {})
            : kind(k), str_val(std::move(s)), int_val(i), array_val(std::move(arr)) {}

        bool operator==(const Reply &other) const {
            if (kind != other.kind) return false;
            switch (kind) {
            case Kind::SimpleString:
            case Kind::Error:
            case Kind::BulkString:
                return str_val == other.str_val;
            case Kind::Integer:
                return int_val == other.int_val;
            case Kind::NullBulk:
                return true;
            case Kind::Array:
                return array_val == other.array_val;
            }
            return false;
        }

        std::string to_string() const {
            switch (kind) {
            case Kind::SimpleString: return "+" + str_val;
            case Kind::Error: return "-" + str_val;
            case Kind::Integer: return ":" + std::to_string(int_val);
            case Kind::BulkString: return "$" + str_val;
            case Kind::NullBulk: return "$-1";
            case Kind::Array: return "*[" + std::to_string(array_val.size()) + "]";
            }
            return "";
        }
    };

    Reply execute(const std::vector<std::string> &args) {
        if (args.empty()) return {Reply::Kind::Error, "ERR empty command"};

        std::string cmd = args[0];
        std::transform(cmd.begin(), cmd.end(), cmd.begin(), ::toupper);

        if (cmd == "SET" && args.size() >= 3) {
            delete_key(args[1]);
            types_[args[1]] = Type::String;
            strings_[args[1]] = args[2];
            return {Reply::Kind::SimpleString, "OK"};
        }
        if (cmd == "GET" && args.size() >= 2) {
            if (type_of(args[1]) != Type::String) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::NullBulk};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            return {Reply::Kind::BulkString, strings_[args[1]]};
        }
        if (cmd == "DEL" && args.size() >= 2) {
            int64_t count = 0;
            for (size_t i = 1; i < args.size(); ++i) {
                if (delete_key(args[i])) count++;
            }
            return {Reply::Kind::Integer, "", count};
        }
        if (cmd == "EXISTS" && args.size() >= 2) {
            int64_t count = 0;
            for (size_t i = 1; i < args.size(); ++i) {
                if (type_of(args[i]) != Type::None) count++;
            }
            return {Reply::Kind::Integer, "", count};
        }
        if (cmd == "LPUSH" && args.size() >= 3) {
            if (type_of(args[1]) != Type::None && type_of(args[1]) != Type::List) {
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            types_[args[1]] = Type::List;
            auto &list = lists_[args[1]];
            for (size_t i = 2; i < args.size(); ++i) {
                list.push_front(args[i]);
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(list.size())};
        }
        if (cmd == "RPUSH" && args.size() >= 3) {
            if (type_of(args[1]) != Type::None && type_of(args[1]) != Type::List) {
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            types_[args[1]] = Type::List;
            auto &list = lists_[args[1]];
            for (size_t i = 2; i < args.size(); ++i) {
                list.push_back(args[i]);
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(list.size())};
        }
        if (cmd == "LPOP" && args.size() >= 2) {
            if (type_of(args[1]) != Type::List) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::NullBulk};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            auto &list = lists_[args[1]];
            if (list.empty()) return {Reply::Kind::NullBulk};
            std::string val = list.front();
            list.pop_front();
            if (list.empty()) delete_key(args[1]);
            return {Reply::Kind::BulkString, val};
        }
        if (cmd == "LLEN" && args.size() >= 2) {
            if (type_of(args[1]) != Type::List) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::Integer, "", 0};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(lists_[args[1]].size())};
        }
        if (cmd == "HSET" && args.size() >= 4) {
            if (type_of(args[1]) != Type::None && type_of(args[1]) != Type::Hash) {
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            types_[args[1]] = Type::Hash;
            auto &h = hashes_[args[1]];
            int64_t added = 0;
            for (size_t i = 2; i + 1 < args.size(); i += 2) {
                if (h.find(args[i]) == h.end()) added++;
                h[args[i]] = args[i + 1];
            }
            return {Reply::Kind::Integer, "", added};
        }
        if (cmd == "HGET" && args.size() >= 3) {
            if (type_of(args[1]) != Type::Hash) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::NullBulk};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            const auto &h = hashes_[args[1]];
            auto it = h.find(args[2]);
            if (it == h.end()) return {Reply::Kind::NullBulk};
            return {Reply::Kind::BulkString, it->second};
        }
        if (cmd == "HLEN" && args.size() >= 2) {
            if (type_of(args[1]) != Type::Hash) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::Integer, "", 0};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(hashes_[args[1]].size())};
        }
        if (cmd == "SADD" && args.size() >= 3) {
            if (type_of(args[1]) != Type::None && type_of(args[1]) != Type::Set) {
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            types_[args[1]] = Type::Set;
            auto &s = sets_[args[1]];
            int64_t added = 0;
            for (size_t i = 2; i < args.size(); ++i) {
                if (s.insert(args[i]).second) added++;
            }
            return {Reply::Kind::Integer, "", added};
        }
        if (cmd == "SISMEMBER" && args.size() >= 3) {
            if (type_of(args[1]) != Type::Set) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::Integer, "", 0};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            const auto &s = sets_[args[1]];
            return {Reply::Kind::Integer, "", s.count(args[2]) > 0 ? 1 : 0};
        }
        if (cmd == "SCARD" && args.size() >= 2) {
            if (type_of(args[1]) != Type::Set) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::Integer, "", 0};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(sets_[args[1]].size())};
        }
        if (cmd == "ZADD" && args.size() >= 4) {
            if (type_of(args[1]) != Type::None && type_of(args[1]) != Type::ZSet) {
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            types_[args[1]] = Type::ZSet;
            auto &z = zsets_[args[1]];
            int64_t added = 0;
            for (size_t i = 2; i + 1 < args.size(); i += 2) {
                double score = std::stod(args[i]);
                const std::string &member = args[i + 1];
                if (z.find(member) == z.end()) added++;
                z[member] = score;
            }
            return {Reply::Kind::Integer, "", added};
        }
        if (cmd == "ZCARD" && args.size() >= 2) {
            if (type_of(args[1]) != Type::ZSet) {
                if (type_of(args[1]) == Type::None) return {Reply::Kind::Integer, "", 0};
                return {Reply::Kind::Error, "WRONGTYPE Operation against a key holding the wrong kind of value"};
            }
            return {Reply::Kind::Integer, "", static_cast<int64_t>(zsets_[args[1]].size())};
        }

        return {Reply::Kind::SimpleString, "OK"};
    }

    Type type_of(const std::string &key) const {
        auto it = types_.find(key);
        if (it == types_.end()) return Type::None;
        return it->second;
    }

    bool delete_key(const std::string &key) {
        auto it = types_.find(key);
        if (it == types_.end()) return false;
        switch (it->second) {
        case Type::String: strings_.erase(key); break;
        case Type::List: lists_.erase(key); break;
        case Type::Hash: hashes_.erase(key); break;
        case Type::Set: sets_.erase(key); break;
        case Type::ZSet: zsets_.erase(key); break;
        case Type::None: break;
        }
        types_.erase(it);
        return true;
    }

    size_t key_count() const { return types_.size(); }

    void clear() {
        types_.clear();
        strings_.clear();
        lists_.clear();
        hashes_.clear();
        sets_.clear();
        zsets_.clear();
    }

  private:
    std::unordered_map<std::string, Type> types_;
    std::unordered_map<std::string, std::string> strings_;
    std::unordered_map<std::string, std::deque<std::string>> lists_;
    std::unordered_map<std::string, std::unordered_map<std::string, std::string>> hashes_;
    std::unordered_map<std::string, std::unordered_set<std::string>> sets_;
    std::unordered_map<std::string, std::unordered_map<std::string, double>> zsets_;
};

static ReferenceModel::Reply parse_resp_reply(const core::Buffer &buf) {
    std::string s(reinterpret_cast<const char *>(buf.readable_data()), buf.readable_bytes());
    if (s.empty()) return {ReferenceModel::Reply::Kind::NullBulk};

    if (s[0] == '+') {
        auto crlf = s.find("\r\n");
        return {ReferenceModel::Reply::Kind::SimpleString, s.substr(1, crlf - 1)};
    }
    if (s[0] == '-') {
        auto crlf = s.find("\r\n");
        return {ReferenceModel::Reply::Kind::Error, s.substr(1, crlf - 1)};
    }
    if (s[0] == ':') {
        auto crlf = s.find("\r\n");
        return {ReferenceModel::Reply::Kind::Integer, "", std::stoll(s.substr(1, crlf - 1))};
    }
    if (s[0] == '$') {
        if (s.rfind("$-1\r\n", 0) == 0) {
            return {ReferenceModel::Reply::Kind::NullBulk};
        }
        auto first_crlf = s.find("\r\n");
        size_t len = std::stoul(s.substr(1, first_crlf - 1));
        std::string payload = s.substr(first_crlf + 2, len);
        return {ReferenceModel::Reply::Kind::BulkString, payload};
    }
    return {ReferenceModel::Reply::Kind::SimpleString, "OK"};
}

class CommandGenerator {
  public:
    explicit CommandGenerator(uint64_t seed) : rng_(seed) {}

    std::vector<std::string> next_command() {
        static const std::vector<std::string> keys = {"k0", "k1", "k2", "k3", "k4"};
        static const std::vector<std::string> vals = {"v0", "v1", "v2", "42", "hello"};
        static const std::vector<std::string> fields = {"f0", "f1", "f2"};

        std::uniform_int_distribution<size_t> cmd_dist(0, 15);
        std::uniform_int_distribution<size_t> key_dist(0, keys.size() - 1);
        std::uniform_int_distribution<size_t> val_dist(0, vals.size() - 1);
        std::uniform_int_distribution<size_t> fld_dist(0, fields.size() - 1);

        const auto &k = keys[key_dist(rng_)];
        const auto &v = vals[val_dist(rng_)];
        const auto &f = fields[fld_dist(rng_)];

        switch (cmd_dist(rng_)) {
        case 0: return {"SET", k, v};
        case 1: return {"GET", k};
        case 2: return {"DEL", k};
        case 3: return {"EXISTS", k};
        case 4: return {"LPUSH", k, v};
        case 5: return {"RPUSH", k, v};
        case 6: return {"LPOP", k};
        case 7: return {"LLEN", k};
        case 8: return {"HSET", k, f, v};
        case 9: return {"HGET", k, f};
        case 10: return {"HLEN", k};
        case 11: return {"SADD", k, v};
        case 12: return {"SISMEMBER", k, v};
        case 13: return {"SCARD", k};
        case 14: return {"ZADD", k, "10", v};
        case 15: return {"ZCARD", k};
        default: return {"GET", k};
        }
    }

  private:
    std::mt19937_64 rng_;
};

static std::vector<std::vector<std::string>> shrink_failure(
    const std::vector<std::vector<std::string>> &cmds,
    size_t failing_idx
) {
    std::vector<std::vector<std::string>> prefix(cmds.begin(), cmds.begin() + static_cast<std::ptrdiff_t>(failing_idx + 1));

    bool reduced = true;
    while (reduced && prefix.size() > 1) {
        reduced = false;
        for (size_t i = 0; i < prefix.size() - 1; ++i) {
            std::vector<std::vector<std::string>> candidate = prefix;
            candidate.erase(candidate.begin() + static_cast<std::ptrdiff_t>(i));

            commands::Dispatcher disp;
            db::TTLManager ttl_mgr;
            commands::register_string_commands(disp, ttl_mgr);
            commands::register_list_commands(disp);
            commands::register_hash_commands(disp);
            commands::register_set_commands(disp);
            commands::register_zset_commands(disp);
            db::Keyspace ks;
            ReferenceModel ref;

            bool candidate_failed = false;
            for (const auto &c : candidate) {
                core::Buffer in_buf, out_buf;
                format_cmd(in_buf, c);
                auto parsed = proto::RespReader::parse(in_buf);
                if (parsed.has_value() && parsed.value().has_value()) {
                    std::size_t dummy_dirty = 0;
                    disp.dispatch(parsed.value().value(), ks, 0, out_buf, dummy_dirty);
                    auto rx_rep = parse_resp_reply(out_buf);
                    auto ref_rep = ref.execute(c);
                    if (!(rx_rep == ref_rep)) {
                        candidate_failed = true;
                        break;
                    }
                }
            }

            if (candidate_failed) {
                prefix = std::move(candidate);
                reduced = true;
                break;
            }
        }
    }
    return prefix;
}

TEST(PropertyInvariantsTest, DifferentialModelOracleWithRandomStream) {
    uint64_t seed = 0xDEADBEEFCAFEBABEULL;
    CommandGenerator gen(seed);

    commands::Dispatcher disp;
    db::TTLManager ttl_mgr;
    commands::register_string_commands(disp, ttl_mgr);
    commands::register_list_commands(disp);
    commands::register_hash_commands(disp);
    commands::register_set_commands(disp);
    commands::register_zset_commands(disp);
    db::Keyspace keyspace;
    ReferenceModel model;

    std::vector<std::vector<std::string>> history;
    constexpr size_t NUM_OPERATIONS = 1000;

    for (size_t step = 0; step < NUM_OPERATIONS; ++step) {
        auto cmd = gen.next_command();
        history.push_back(cmd);

        core::Buffer in_buf, out_buf;
        format_cmd(in_buf, cmd);
        auto parsed = proto::RespReader::parse(in_buf);
        ASSERT_TRUE(parsed.has_value() && parsed.value().has_value());

        std::size_t dummy_dirty = 0;
        disp.dispatch(parsed.value().value(), keyspace, 0, out_buf, dummy_dirty);

        auto redisx_reply = parse_resp_reply(out_buf);
        auto model_reply = model.execute(cmd);

        if (!(redisx_reply == model_reply)) {
            std::cerr << "\n========================================\n"
                      << "PROPERTY INVARIANT FAILURE DETECTED!\n"
                      << "Reproducing Seed: 0x" << std::hex << seed << std::dec << "\n"
                      << "Failed at step: " << step << "\n"
                      << "Command: ";
            for (const auto &arg : cmd) std::cerr << arg << " ";
            std::cerr << "\nRedisX reply: " << redisx_reply.to_string()
                      << "\nModel reply:  " << model_reply.to_string() << "\n";

            auto shrunk = shrink_failure(history, step);
            std::cerr << "Minimized failing trace (" << shrunk.size() << " commands):\n";
            for (const auto &scmd : shrunk) {
                std::cerr << "  ";
                for (const auto &arg : scmd) std::cerr << arg << " ";
                std::cerr << "\n";
            }
            std::cerr << "========================================\n";
            FAIL() << "Differential comparison failed against ReferenceModel at step " << step;
        }

        ASSERT_EQ(keyspace.db_size(0), model.key_count())
            << "Keyspace size diverged at step " << step << " for seed 0x" << std::hex << seed;
    }
}

} // namespace redisx::property
