#pragma once
#include "redisx/proto/command.h"
#include <vector>
namespace redisx::commands {
inline std::vector<std::size_t> command_key_indices(const proto::Command &cmd) {
    const auto &n = cmd.name_upper();
    std::vector<std::size_t> keys;
    const std::string single = " GET SET APPEND STRLEN INCR DECR INCRBY DECRBY INCRBYFLOAT GETSET SETEX PSETEX GETDEL GETEX TYPE TTL PTTL EXPIRE PEXPIRE EXPIREAT PEXPIREAT PERSIST LPUSH RPUSH LPOP RPOP LRANGE LLEN LINDEX LSET LTRIM LREM HSET HGET HDEL HGETALL HLEN HEXISTS HKEYS HVALS HINCRBY SADD SREM SMEMBERS SISMEMBER SCARD SPOP SRANDMEMBER ZADD ZSCORE ZRANGE ZRANK ZREM ZCARD ZINCRBY ZRANGEBYSCORE ZCOUNT ";
    if (single.find(" " + n + " ") != std::string::npos) { if (cmd.arg_count() > 1) keys.push_back(1); }
    else if (n == "DEL" || n == "UNLINK" || n == "EXISTS" || n == "WATCH" || n == "MGET" || n == "SUNION" || n == "SINTER" || n == "SDIFF") {
        for (std::size_t i = 1; i < cmd.arg_count(); ++i) keys.push_back(i);
    } else if (n == "MSET" || n == "MSETNX") {
        for (std::size_t i = 1; i < cmd.arg_count(); i += 2) keys.push_back(i);
    } else if (n == "BLPOP" || n == "BRPOP") {
        for (std::size_t i = 1; i + 1 < cmd.arg_count(); ++i) keys.push_back(i);
    } else if (n == "BLMOVE" || n == "LMOVE" || n == "BRPOPLPUSH" || n == "RPOPLPUSH" || n == "RENAME" || n == "RENAMENX") {
        for (std::size_t i = 1; i < 3 && i < cmd.arg_count(); ++i) keys.push_back(i);
    }
    return keys;
}
}
