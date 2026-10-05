#ifndef REDISX_REPLICATION_REPL_STREAM_H
#define REDISX_REPLICATION_REPL_STREAM_H

#include "redisx/core/buffer.h"
#include "redisx/db/keyspace.h"
#include "redisx/net/connection.h"
#include "redisx/proto/command.h"
#include "redisx/replication/backlog.h"
#include "redisx/replication/replid.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace redisx::replication {

struct ReplicaClientInfo {
    std::shared_ptr<net::Connection> conn;
    std::uint16_t listening_port{0};
    std::uint64_t ack_offset{0};
    std::uint64_t last_ack_time_ms{0};
    bool online{false};
};

class ReplStream {
  public:
    ReplStream(ReplIdManager &replid_mgr, ReplBacklog &backlog);

    void add_replica(std::shared_ptr<net::Connection> conn, std::uint16_t listening_port = 0);
    void remove_replica(int fd);
    void update_replica_ack(int fd, std::uint64_t ack_offset, std::uint64_t now_ms);

    void propagate_command(
        const proto::Command &cmd,
        db::Keyspace &keyspace,
        std::size_t db_idx
    );

    void propagate_explicit_del(std::size_t db_idx, const std::string &key);

    std::size_t count_replicas_at_offset(std::uint64_t target_offset) const;

    [[nodiscard]] const std::unordered_map<int, ReplicaClientInfo> &replicas() const noexcept {
        return replicas_;
    }

    [[nodiscard]] ReplIdManager &replid_manager() noexcept { return replid_mgr_; }
    [[nodiscard]] ReplBacklog &backlog() noexcept { return backlog_; }

  private:
    void send_bytes_to_all(const std::string &bytes);
    void ensure_db_selected(std::size_t db_idx);

    ReplIdManager &replid_mgr_;
    ReplBacklog &backlog_;
    std::unordered_map<int, ReplicaClientInfo> replicas_;
    std::size_t active_stream_db_{0};
};

} // namespace redisx::replication

#endif // REDISX_REPLICATION_REPL_STREAM_H
