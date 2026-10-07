#include "redisx/tx/watch.h"

namespace redisx::tx {

void WatchManager::register_client_tx(int fd, ClientTxState *tx_state) {
    if (tx_state) {
        client_tx_map_[fd] = tx_state;
    }
}

void WatchManager::unregister_client_tx(int fd) {
    auto it = client_tx_map_.find(fd);
    if (it != client_tx_map_.end()) {
        if (it->second) {
            unwatch_all(fd, *(it->second));
        }
        client_tx_map_.erase(it);
    }
}

void WatchManager::watch_key(int fd, std::size_t db_idx, const std::string &key, ClientTxState &tx_state) {
    auto pair = std::make_pair(db_idx, key);
    watched_map_[pair].insert(fd);
    tx_state.watched_keys.push_back(pair);
    client_tx_map_[fd] = &tx_state;
}

void WatchManager::unwatch_all(int fd, ClientTxState &tx_state) {
    for (const auto &pair : tx_state.watched_keys) {
        auto it = watched_map_.find(pair);
        if (it != watched_map_.end()) {
            it->second.erase(fd);
            if (it->second.empty()) {
                watched_map_.erase(it);
            }
        }
    }
    tx_state.watched_keys.clear();
    tx_state.dirty_cas = false;
}

void WatchManager::touch_key(std::size_t db_idx, const std::string &key) {
    auto pair = std::make_pair(db_idx, key);
    auto it = watched_map_.find(pair);
    if (it != watched_map_.end()) {
        for (int fd : it->second) {
            auto client_it = client_tx_map_.find(fd);
            if (client_it != client_tx_map_.end() && client_it->second) {
                client_it->second->dirty_cas = true;
            }
        }
    }
}

void WatchManager::touch_all(std::size_t db_idx) {
    for (auto &[pair, fds] : watched_map_) {
        if (pair.first == db_idx) {
            for (int fd : fds) {
                auto client_it = client_tx_map_.find(fd);
                if (client_it != client_tx_map_.end() && client_it->second) {
                    client_it->second->dirty_cas = true;
                }
            }
        }
    }
}

} // namespace redisx::tx
