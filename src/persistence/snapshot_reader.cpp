#include "redisx/persistence/snapshot_reader.h"
#include "redisx/persistence/format.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"

#include <cstring>
#include <fstream>
#include <vector>

namespace redisx::persistence {

core::Result<void> SnapshotReader::load_snapshot(db::Keyspace &keyspace, const std::string &filepath) {
    std::ifstream in(filepath, std::ios::binary | std::ios::ate);
    if (!in.is_open()) {
        return core::ErrorCode::NotFound;
    }

    std::streamsize filesize = in.tellg();
    if (filesize < 18) { // 6 magic + 4 version + 1 OP_EOF + 8 CRC = 19 min size
        REDISX_LOG_ERROR("Snapshot file too small: %s", filepath.c_str());
        return core::ErrorCode::ProtocolError;
    }

    in.seekg(0, std::ios::beg);
    std::vector<std::uint8_t> buffer(static_cast<std::size_t>(filesize));
    if (!in.read(reinterpret_cast<char *>(buffer.data()), filesize)) {
        REDISX_LOG_ERROR("Failed to read snapshot file: %s", filepath.c_str());
        return core::ErrorCode::IoError;
    }

    std::size_t offset = 0;
    std::size_t total_len = buffer.size();

    // 1. Verify Magic & Version
    if (total_len < 10) return core::ErrorCode::ProtocolError;
    std::string_view magic(reinterpret_cast<const char *>(buffer.data()), 6);
    std::string_view version(reinterpret_cast<const char *>(buffer.data() + 6), 4);
    offset += 10;

    if (magic != RDB_MAGIC || version != RDB_VERSION) {
        REDISX_LOG_ERROR("Snapshot header mismatch (magic=%.6s ver=%.4s)", magic.data(), version.data());
        return core::ErrorCode::ProtocolError;
    }

    std::uint64_t now_ms = core::get_global_time_provider()->wall_now_ms();
    std::size_t current_db = 0;
    std::uint64_t running_crc = 0;

    // Running CRC over header
    running_crc = crc64(running_crc, buffer.data(), 10);

    // Lambda helpers
    auto read_bytes = [&](void *dest, std::size_t len) -> bool {
        if (offset + len > total_len) return false;
        std::memcpy(dest, buffer.data() + offset, len);
        running_crc = crc64(running_crc, buffer.data() + offset, len);
        offset += len;
        return true;
    };

    auto read_varint = [&](std::size_t &out_len) -> bool {
        std::size_t start = offset;
        if (!decode_varint(buffer.data(), total_len, offset, out_len)) return false;
        running_crc = crc64(running_crc, buffer.data() + start, offset - start);
        return true;
    };

    auto read_string = [&](std::string &out_str) -> bool {
        std::size_t len = 0;
        if (!read_varint(len)) return false;
        out_str.resize(len);
        if (len > 0) {
            if (!read_bytes(out_str.data(), len)) return false;
        }
        return true;
    };

    // 2. Parse Record Loop
    bool reached_eof = false;

    while (offset < total_len && !reached_eof) {
        std::uint8_t opcode_or_type = 0;
        if (!read_bytes(&opcode_or_type, 1)) return core::ErrorCode::ProtocolError;

        std::uint64_t expire_at_ms = 0;

        if (opcode_or_type == static_cast<std::uint8_t>(Opcode::SelectDb)) {
            if (!read_varint(current_db)) return core::ErrorCode::ProtocolError;
            if (!db::Keyspace::is_valid_db(current_db)) return core::ErrorCode::InvalidArgument;
            continue;
        } else if (opcode_or_type == static_cast<std::uint8_t>(Opcode::ExpireMs)) {
            if (!read_bytes(&expire_at_ms, sizeof(expire_at_ms))) return core::ErrorCode::ProtocolError;
            if (!read_bytes(&opcode_or_type, 1)) return core::ErrorCode::ProtocolError;
        } else if (opcode_or_type == static_cast<std::uint8_t>(Opcode::Eof)) {
            reached_eof = true;
            break;
        }

        // opcode_or_type is now RdbType
        std::string key;
        if (!read_string(key)) return core::ErrorCode::ProtocolError;

        types::Object obj = types::Object("");
        RdbType type = static_cast<RdbType>(opcode_or_type);

        switch (type) {
        case RdbType::String: {
            std::string val;
            if (!read_string(val)) return core::ErrorCode::ProtocolError;
            obj = types::Object(std::move(val));
            break;
        }
        case RdbType::List: {
            std::size_t count = 0;
            if (!read_varint(count)) return core::ErrorCode::ProtocolError;
            obj = types::Object::create_list();
            for (std::size_t i = 0; i < count; ++i) {
                std::string item;
                if (!read_string(item)) return core::ErrorCode::ProtocolError;
                obj.list_push_back(item);
            }
            break;
        }
        case RdbType::Set: {
            std::size_t count = 0;
            if (!read_varint(count)) return core::ErrorCode::ProtocolError;
            obj = types::Object::create_set();
            for (std::size_t i = 0; i < count; ++i) {
                std::string m;
                if (!read_string(m)) return core::ErrorCode::ProtocolError;
                obj.set_add(m);
            }
            break;
        }
        case RdbType::Hash: {
            std::size_t count = 0;
            if (!read_varint(count)) return core::ErrorCode::ProtocolError;
            obj = types::Object::create_hash();
            for (std::size_t i = 0; i < count; ++i) {
                std::string f, v;
                if (!read_string(f) || !read_string(v)) return core::ErrorCode::ProtocolError;
                obj.hash_set(f, v);
            }
            break;
        }
        case RdbType::ZSet: {
            std::size_t count = 0;
            if (!read_varint(count)) return core::ErrorCode::ProtocolError;
            obj = types::Object::create_zset();
            for (std::size_t i = 0; i < count; ++i) {
                double score = 0.0;
                std::string member;
                if (!read_bytes(&score, sizeof(score))) return core::ErrorCode::ProtocolError;
                if (!read_string(member)) return core::ErrorCode::ProtocolError;
                obj.zset_add(score, member);
            }
            break;
        }
        }

        // Check if expired
        if (expire_at_ms == 0 || expire_at_ms > now_ms) {
            keyspace.db_set(current_db, std::move(key), db::Value(std::move(obj)), expire_at_ms);
        }
    }

    if (!reached_eof) {
        REDISX_LOG_ERROR("Unexpected end of snapshot before EOF tag");
        return core::ErrorCode::ProtocolError;
    }

    // 3. Verify CRC64 Checksum
    std::uint64_t expected_crc = 0;
    if (offset + sizeof(expected_crc) > total_len) {
        REDISX_LOG_ERROR("Missing CRC64 checksum in snapshot");
        return core::ErrorCode::ProtocolError;
    }
    std::memcpy(&expected_crc, buffer.data() + offset, sizeof(expected_crc));

    if (running_crc != expected_crc) {
        REDISX_LOG_ERROR("Snapshot CRC64 mismatch: computed=0x%llx expected=0x%llx",
                          static_cast<unsigned long long>(running_crc),
                          static_cast<unsigned long long>(expected_crc));
        return core::ErrorCode::ProtocolError;
    }

    return {};
}

} // namespace redisx::persistence
