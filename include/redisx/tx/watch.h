#ifndef REDISX_TX_WATCH_H
#define REDISX_TX_WATCH_H

#include <cstddef>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace redisx::tx {

struct QueuedCommand {
    std::string name_upper;
    std::vector<std::string> args;
    std::size_t db_idx;
};

struct ClientTxState {
    bool in_multi{false};
    bool exec_abort{false};
    bool dirty_cas{false};
    std::vector<QueuedCommand> queue;
    std::vector<std::pair<std::size_t, std::string>> watched_keys;

    void reset_multi() {
        in_multi = false;
        exec_abort = false;
        queue.clear();
    }

    void clear_all() {
        reset_multi();
        dirty_cas = false;
        watched_keys.clear();
    }
};

struct DbKeyHash {
    std::size_t operator()(const std::pair<std::size_t, std::string> &p) const noexcept {
        std::size_t h1 = std::hash<std::size_t>{}(p.first);
        std::size_t h2 = std::hash<std::string>{}(p.second);
        return h1 ^ (h2 << 1);
    }
};

class WatchManager {
  public:
    WatchManager() = default;

    void register_client_tx(int fd, ClientTxState *tx_state);
    void unregister_client_tx(int fd);

    void watch_key(int fd, std::size_t db_idx, const std::string &key, ClientTxState &tx_state);
    void unwatch_all(int fd, ClientTxState &tx_state);

    void touch_key(std::size_t db_idx, const std::string &key);
    void touch_all(std::size_t db_idx);

  private:
    std::unordered_map<std::pair<std::size_t, std::string>, std::unordered_set<int>, DbKeyHash> watched_map_;
    std::unordered_map<int, ClientTxState *> client_tx_map_;
};

} // namespace redisx::tx

#endif // REDISX_TX_WATCH_H
