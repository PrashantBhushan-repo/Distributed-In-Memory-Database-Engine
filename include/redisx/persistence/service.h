#ifndef REDISX_PERSISTENCE_SERVICE_H
#define REDISX_PERSISTENCE_SERVICE_H
#include "redisx/config/config.h"
#include "redisx/persistence/aof.h"
#include <utility>
namespace redisx::persistence {
// Event-loop-owned persistence. Children operate on fork snapshots, never live threads.
class PersistenceService {
public:
    explicit PersistenceService(const config::ConfigManager &config);
    ~PersistenceService();
    bool open();
    bool append(std::size_t db, const std::vector<std::string> &args);
    bool save(const db::Keyspace &keys);
    bool replace_from_full_sync(const db::Keyspace &keys);
    bool background_save(const db::Keyspace &keys);
    bool background_rewrite(const db::Keyspace &keys);
    void tick(const db::Keyspace &keys);
    [[nodiscard]] bool writable() const { return !enabled_ || aof_.healthy(); }
    [[nodiscard]] bool enabled() const { return enabled_; }
    [[nodiscard]] bool saving() const { return save_pid_ > 0; }
    [[nodiscard]] std::uint64_t last_save_time() const { return last_save_time_; }
    [[nodiscard]] const std::string &snapshot_path() const { return snapshot_path_; }
    [[nodiscard]] const std::string &aof_path() const { return aof_path_; }
private:
    const config::ConfigManager &config_;
    AofManager aof_;
    std::string snapshot_path_, aof_path_, rewrite_path_;
    bool enabled_{false};
    unsigned transaction_depth_{0};
    int save_pid_{-1}, rewrite_pid_{-1};
    std::uint64_t last_save_time_{0}, last_fsync_ms_{0}, last_save_ms_{0};
    std::uint64_t dirty_{0}, saving_dirty_{0};
    std::vector<std::pair<std::uint64_t, std::uint64_t>> save_rules_;
    void reap_children();
};
}
#endif
