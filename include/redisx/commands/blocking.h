#ifndef REDISX_COMMANDS_BLOCKING_H
#define REDISX_COMMANDS_BLOCKING_H

#include "redisx/commands/dispatcher.h"
#include "redisx/db/keyspace.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/pubsub/pubsub.h"
#include "redisx/tx/watch.h"

#include <cstddef>
#include <cstdint>
#include <deque>
#include <list>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace redisx::commands {

enum class BlockingOpType {
    BLPOP,
    BRPOP,
    BLMOVE,
    BRPOPLPUSH
};

struct BlockedClientInfo {
    int fd;
    std::weak_ptr<net::Connection> conn;
    std::size_t db_idx;
    std::vector<std::string> keys;
    std::string target_key;
    BlockingOpType op_type;
    bool is_left_pop{true};
    bool is_left_push{true};
    net::TimerId timer_id{0};
};

class BlockedClientsManager {
  public:
    explicit BlockedClientsManager(net::EventLoop &loop) : loop_(loop) {}

    void block_client(
        std::shared_ptr<net::Connection> conn,
        std::size_t db_idx,
        std::vector<std::string> keys,
        std::string target_key,
        BlockingOpType op_type,
        bool is_left_pop,
        bool is_left_push,
        double timeout_sec
    );

    void signal_ready_key(std::size_t db_idx, const std::string &key);

    void drain_ready_keys(
        db::Keyspace &keyspace,
        const Dispatcher &dispatcher,
        tx::WatchManager *watch_mgr = nullptr,
        pubsub::PubSubManager *pubsub_mgr = nullptr
    );

    void remove_client(int fd);

  private:
    net::EventLoop &loop_;
    std::unordered_map<std::pair<std::size_t, std::string>, std::list<std::shared_ptr<BlockedClientInfo>>, tx::DbKeyHash> blocked_map_;
    std::unordered_map<int, std::shared_ptr<BlockedClientInfo>> client_info_map_;
    std::vector<std::pair<std::size_t, std::string>> ready_keys_;
};

void register_blocking_commands(
    Dispatcher &dispatcher,
    BlockedClientsManager &blocked_mgr,
    tx::WatchManager *watch_mgr = nullptr,
    pubsub::PubSubManager *pubsub_mgr = nullptr
);

} // namespace redisx::commands

#endif // REDISX_COMMANDS_BLOCKING_H
