#ifndef REDISX_REPLICATION_REPLICA_LINK_H
#define REDISX_REPLICATION_REPLICA_LINK_H

#include "redisx/core/buffer.h"
#include "redisx/db/keyspace.h"
#include "redisx/db/ttl.h"
#include "redisx/net/connection.h"
#include "redisx/net/event_loop.h"
#include "redisx/proto/resp_reader.h"

#include <cstdint>
#include <memory>
#include <string>

namespace redisx::commands {
class Dispatcher;
}

namespace redisx::replication {

enum class ReplicaLinkState {
    Idle,
    Connecting,
    HandshakePing,
    HandshakePort,
    HandshakeCapa,
    HandshakePsync,
    ReceivingSnapshot,
    Streaming
};

class ReplicaLink {
  public:
    ReplicaLink(
        net::EventLoop &loop,
        db::Keyspace &keyspace,
        const commands::Dispatcher &dispatcher,
        db::TTLManager &ttl_mgr
    );
    ~ReplicaLink();

    void connect(const std::string &master_host, std::uint16_t master_port, std::uint16_t my_listening_port = 6379);
    void disconnect();
    void make_master();

    [[nodiscard]] ReplicaLinkState state() const noexcept { return state_; }
    [[nodiscard]] bool is_replica_mode() const noexcept { return is_replica_mode_; }
    [[nodiscard]] const std::string &master_host() const noexcept { return master_host_; }
    [[nodiscard]] std::uint16_t master_port() const noexcept { return master_port_; }
    [[nodiscard]] std::uint64_t applied_offset() const noexcept { return applied_offset_; }
    [[nodiscard]] const std::string &master_replid() const noexcept { return master_replid_; }

    void send_ack_if_due();

  private:
    void handle_data();
    void process_handshake();
    void process_streaming_data();
    void schedule_reconnect();

    net::EventLoop &loop_;
    db::Keyspace &keyspace_;
    const commands::Dispatcher &dispatcher_;
    db::TTLManager &ttl_mgr_;

    std::string master_host_;
    std::uint16_t master_port_{0};
    std::uint16_t my_listening_port_{6379};

    ReplicaLinkState state_{ReplicaLinkState::Idle};
    bool is_replica_mode_{false};
    std::shared_ptr<net::Connection> conn_;

    std::string master_replid_{"?"};
    std::uint64_t applied_offset_{0};
    std::uint64_t snapshot_expected_len_{0};
    bool snapshot_hdr_parsed_{false};

    std::size_t active_db_{0};
    net::TimerId ack_timer_id_{0};
    net::TimerId reconnect_timer_id_{0};
};

} // namespace redisx::replication

#endif // REDISX_REPLICATION_REPLICA_LINK_H
