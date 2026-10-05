#include "redisx/replication/replica_link.h"
#include "redisx/commands/dispatcher.h"
#include "redisx/core/logging.h"
#include "redisx/net/socket_utils.h"
#include "redisx/persistence/snapshot_reader.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <cstring>
#include <fstream>
#include <sstream>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netdb.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace redisx::replication {

ReplicaLink::ReplicaLink(
    net::EventLoop &loop,
    db::Keyspace &keyspace,
    const commands::Dispatcher &dispatcher,
    db::TTLManager &ttl_mgr
)
    : loop_(loop),
      keyspace_(keyspace),
      dispatcher_(dispatcher),
      ttl_mgr_(ttl_mgr) {}

ReplicaLink::~ReplicaLink() {
    disconnect();
}

void ReplicaLink::disconnect() {
    if (ack_timer_id_ != 0) {
        loop_.cancel_timer(ack_timer_id_);
        ack_timer_id_ = 0;
    }
    if (reconnect_timer_id_ != 0) {
        loop_.cancel_timer(reconnect_timer_id_);
        reconnect_timer_id_ = 0;
    }
    if (conn_) {
        conn_->close();
        conn_.reset();
    }
    state_ = ReplicaLinkState::Idle;
}

void ReplicaLink::make_master() {
    disconnect();
    is_replica_mode_ = false;
    ttl_mgr_.set_replica_mode(false);
}

void ReplicaLink::connect(const std::string &master_host, std::uint16_t master_port, std::uint16_t my_listening_port) {
    disconnect();

    master_host_ = master_host;
    master_port_ = master_port;
    my_listening_port_ = my_listening_port;
    is_replica_mode_ = true;
    ttl_mgr_.set_replica_mode(true);

    int sock = static_cast<int>(socket(AF_INET, SOCK_STREAM, 0));
    if (sock < 0) {
        REDISX_LOG_ERROR("Failed to create socket for replica link to %s:%u", master_host.c_str(), master_port);
        schedule_reconnect();
        return;
    }

    net::set_nonblocking(sock);
    net::set_tcp_nodelay(sock);

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(master_port);
    inet_pton(AF_INET, master_host.c_str(), &addr.sin_addr);

#ifdef _WIN32
    int res = ::connect(static_cast<SOCKET>(sock), reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr));
#else
    int res = ::connect(sock, reinterpret_cast<struct sockaddr *>(&addr), sizeof(addr));
#endif
    if (res < 0) {
#ifdef _WIN32
        int err = WSAGetLastError();
        if (err != WSAEWOULDBLOCK && err != WSAEINPROGRESS) {
            REDISX_LOG_WARN("Non-blocking connect failed to %s:%u with err %d", master_host.c_str(), master_port, err);
        }
#else
        if (errno != EINPROGRESS) {
            REDISX_LOG_WARN("Non-blocking connect failed to %s:%u with errno %d", master_host.c_str(), master_port, errno);
        }
#endif
    }

    state_ = ReplicaLinkState::Connecting;

    conn_ = std::make_shared<net::Connection>(loop_, sock);
    conn_->set_data_callback([this](std::shared_ptr<net::Connection>) {
        handle_data();
    });
    conn_->set_close_callback([this](std::shared_ptr<net::Connection>) {
        REDISX_LOG_WARN("Replica link to master disconnected unexpectedly");
        disconnect();
        schedule_reconnect();
    });
    conn_->start();

    // Begin Handshake by sending PING
    state_ = ReplicaLinkState::HandshakePing;
    proto::RespWriter::write_string_array(conn_->out_buffer(), {"PING"});
    conn_->flush();

    // Schedule 1-second periodic ACK timer
    ack_timer_id_ = loop_.add_timer(1000, [this]() {
        send_ack_if_due();
    });
}

void ReplicaLink::schedule_reconnect() {
    if (state_ == ReplicaLinkState::Idle && !is_replica_mode_) return;
    REDISX_LOG_INFO("Scheduling replica link reconnect to %s:%u in 2000ms...", master_host_.c_str(), master_port_);
    reconnect_timer_id_ = loop_.add_timer(2000, [this]() {
        reconnect_timer_id_ = 0;
        if (is_replica_mode_) {
            connect(master_host_, master_port_, my_listening_port_);
        }
    });
}

void ReplicaLink::send_ack_if_due() {
    if (state_ == ReplicaLinkState::Streaming && conn_ && conn_->state() == net::ConnectionState::Connected) {
        proto::RespWriter::write_string_array(conn_->out_buffer(), {"REPLCONF", "ACK", std::to_string(applied_offset_)});
        conn_->flush();
    }
}

void ReplicaLink::handle_data() {
    if (state_ == ReplicaLinkState::Streaming) {
        process_streaming_data();
    } else {
        process_handshake();
    }
}

void ReplicaLink::process_handshake() {
    auto &in_buf = conn_->in_buffer();

    while (in_buf.readable_bytes() > 0) {
        if (state_ == ReplicaLinkState::ReceivingSnapshot) {
            if (!snapshot_hdr_parsed_) {
                std::string_view view = in_buf.peek_string_view();
                std::size_t crlf = view.find("\r\n");
                if (crlf == std::string_view::npos) {
                    break; // Wait for complete length line
                }
                std::string line(view.substr(0, crlf));
                in_buf.consume(crlf + 2);
                if (!line.empty() && line[0] == '$') {
                    try {
                        snapshot_expected_len_ = std::stoull(line.substr(1));
                    } catch (...) {
                        snapshot_expected_len_ = 0;
                    }
                    snapshot_hdr_parsed_ = true;
                }
            }

            if (snapshot_hdr_parsed_) {
                if (in_buf.readable_bytes() >= snapshot_expected_len_) {
                    std::string snapshot_data(in_buf.peek_string_view().substr(0, snapshot_expected_len_));
                    in_buf.consume(snapshot_expected_len_);
                    keyspace_.flush_db(active_db_);

                    if (snapshot_expected_len_ > 0) {
                        std::string temp_file = "replica_dump.rdb";
                        std::ofstream ofs(temp_file, std::ios::binary);
                        ofs.write(snapshot_data.data(), static_cast<std::streamsize>(snapshot_data.size()));
                        ofs.close();

                        persistence::SnapshotReader reader;
                        auto load_res = reader.load_snapshot(keyspace_, temp_file);
                        if (load_res.is_error()) {
                            REDISX_LOG_ERROR("Failed to load snapshot payload during FULLRESYNC");
                        } else {
                            REDISX_LOG_INFO("Loaded snapshot payload successfully during FULLRESYNC");
                        }
                    }
                    snapshot_hdr_parsed_ = false;
                    state_ = ReplicaLinkState::Streaming;
                    process_streaming_data();
                    return;
                }
                break;
            }
        }

        auto result = proto::RespReader::parse(in_buf);
        if (result.is_error()) {
            REDISX_LOG_ERROR("Protocol error during replica handshake");
            disconnect();
            schedule_reconnect();
            return;
        }
        if (!result.value().has_value()) {
            break; // Incomplete handshake response
        }

        const auto &cmd = result.value().value();
        std::string reply_str = cmd.empty() ? "" : cmd.arg(0);

        switch (state_) {
        case ReplicaLinkState::HandshakePing:
            state_ = ReplicaLinkState::HandshakePort;
            proto::RespWriter::write_string_array(conn_->out_buffer(), {"REPLCONF", "listening-port", std::to_string(my_listening_port_)});
            conn_->flush();
            break;

        case ReplicaLinkState::HandshakePort:
            state_ = ReplicaLinkState::HandshakeCapa;
            proto::RespWriter::write_string_array(conn_->out_buffer(), {"REPLCONF", "capa", "eof"});
            conn_->flush();
            break;

        case ReplicaLinkState::HandshakeCapa:
            state_ = ReplicaLinkState::HandshakePsync;
            proto::RespWriter::write_string_array(conn_->out_buffer(), {"PSYNC", master_replid_, std::to_string(applied_offset_ == 0 ? -1 : static_cast<std::int64_t>(applied_offset_))});
            conn_->flush();
            break;

        case ReplicaLinkState::HandshakePsync:
            if (reply_str.rfind("CONTINUE", 0) == 0 || reply_str.rfind("+CONTINUE", 0) == 0) {
                REDISX_LOG_INFO("Master accepted PSYNC (+CONTINUE), resuming replication stream");
                state_ = ReplicaLinkState::Streaming;
                process_streaming_data();
            } else if (reply_str.rfind("FULLRESYNC", 0) == 0 || reply_str.rfind("+FULLRESYNC", 0) == 0) {
                std::istringstream iss(reply_str);
                std::string status, replid;
                std::uint64_t offset = 0;
                iss >> status >> replid >> offset;
                if (!replid.empty()) master_replid_ = replid;
                applied_offset_ = offset;
                REDISX_LOG_INFO("Master full resync triggered: replid=%s, offset=%llu", master_replid_.c_str(), static_cast<unsigned long long>(offset));

                state_ = ReplicaLinkState::ReceivingSnapshot;
                snapshot_expected_len_ = 0;
            } else {
                REDISX_LOG_WARN("Unexpected PSYNC reply from master: %s", reply_str.c_str());
                state_ = ReplicaLinkState::Streaming;
            }
            break;

        default:
            break;
        }
    }
}

void ReplicaLink::process_streaming_data() {
    if (!conn_) return;
    auto &in_buf = conn_->in_buffer();

    core::Buffer dummy_out;
    std::size_t out_db = active_db_;

    while (in_buf.readable_bytes() > 0) {
        std::size_t start_readable = in_buf.readable_bytes();

        auto result = proto::RespReader::parse(in_buf);
        if (result.is_error()) {
            REDISX_LOG_ERROR("Protocol error on replication stream");
            disconnect();
            schedule_reconnect();
            return;
        }
        if (!result.value().has_value()) {
            break;
        }

        std::size_t end_readable = in_buf.readable_bytes();
        std::size_t bytes_consumed = start_readable - end_readable;
        applied_offset_ += bytes_consumed;

        const auto &cmd = result.value().value();

        if (cmd.name_upper() == "SELECT" && cmd.arg_count() >= 2) {
            active_db_ = static_cast<std::size_t>(std::stoul(cmd.arg(1)));
        } else {
            dispatcher_.dispatch(cmd, keyspace_, active_db_, dummy_out, out_db, nullptr, &ttl_mgr_);
            active_db_ = out_db;
        }
    }
}

} // namespace redisx::replication
