#include "redisx/persistence/snapshot_writer.h"
#include "redisx/persistence/format.h"
#include "redisx/core/logging.h"
#include "redisx/core/time.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <limits>
#include <vector>

namespace redisx::persistence {

static void write_buf(std::ofstream &out, std::uint64_t &crc, const void *data, std::size_t size) {
    out.write(static_cast<const char *>(data), static_cast<std::streamsize>(size));
    crc = crc64(crc, data, size);
}

static void write_varint(std::ofstream &out, std::uint64_t &crc, std::size_t len) {
    std::vector<std::uint8_t> buf;
    encode_varint(buf, len);
    write_buf(out, crc, buf.data(), buf.size());
}

static void write_string(std::ofstream &out, std::uint64_t &crc, std::string_view str) {
    write_varint(out, crc, str.size());
    if (!str.empty()) {
        write_buf(out, crc, str.data(), str.size());
    }
}

bool SnapshotWriter::write_snapshot(const db::Keyspace &keyspace, const std::string &filepath) {
    std::string tmp_filepath = filepath + ".tmp";
    std::ofstream out(tmp_filepath, std::ios::binary);
    if (!out.is_open()) {
        REDISX_LOG_ERROR("Failed to open temp snapshot file: %s", tmp_filepath.c_str());
        return false;
    }

    std::uint64_t crc = 0;
    std::uint64_t now_ms = core::get_global_time_provider()->wall_now_ms();

    // 1. Write Magic + Version
    write_buf(out, crc, RDB_MAGIC.data(), RDB_MAGIC.size());
    write_buf(out, crc, RDB_VERSION.data(), RDB_VERSION.size());

    // 2. Iterate through 16 DBs
    for (std::size_t db_idx = 0; db_idx < db::Keyspace::NUM_DATABASES; ++db_idx) {
        const auto &dict = keyspace.get_db(db_idx);
        if (dict.empty()) continue;

        // Write SELECTDB opcode
        std::uint8_t select_op = static_cast<std::uint8_t>(Opcode::SelectDb);
        write_buf(out, crc, &select_op, 1);
        write_varint(out, crc, db_idx);

        std::uint64_t cursor = 0;
        do {
            cursor = dict.scan(cursor, [&](const db::Entry *entry) {
                if (!entry) return;

                // Check expiry
                if (entry->expire_at_ms > 0 && entry->expire_at_ms <= now_ms) {
                    return; // Skip expired key
                }

                // Write EXPIRETIME_MS opcode if TTL exists
                if (entry->expire_at_ms > 0) {
                    std::uint8_t exp_op = static_cast<std::uint8_t>(Opcode::ExpireMs);
                    write_buf(out, crc, &exp_op, 1);
                    std::uint64_t exp_le = entry->expire_at_ms;
                    write_buf(out, crc, &exp_le, sizeof(exp_le));
                }

                // Write RDB Type byte
                const auto &obj = entry->value.object();
                std::uint8_t type_byte = 0;
                switch (obj.type()) {
                case types::ObjectType::String: type_byte = static_cast<std::uint8_t>(RdbType::String); break;
                case types::ObjectType::List:   type_byte = static_cast<std::uint8_t>(RdbType::List); break;
                case types::ObjectType::Set:    type_byte = static_cast<std::uint8_t>(RdbType::Set); break;
                case types::ObjectType::ZSet:   type_byte = static_cast<std::uint8_t>(RdbType::ZSet); break;
                case types::ObjectType::Hash:   type_byte = static_cast<std::uint8_t>(RdbType::Hash); break;
                }
                write_buf(out, crc, &type_byte, 1);

                // Write Key
                write_string(out, crc, entry->key);

                // Write Value Payload
                switch (obj.type()) {
                case types::ObjectType::String: {
                    write_string(out, crc, obj.as_string());
                    break;
                }
                case types::ObjectType::List: {
                    auto items = obj.list_range(0, -1);
                    write_varint(out, crc, items.size());
                    for (const auto &item : items) {
                        write_string(out, crc, item);
                    }
                    break;
                }
                case types::ObjectType::Set: {
                    auto members = obj.set_members();
                    write_varint(out, crc, members.size());
                    for (const auto &m : members) {
                        write_string(out, crc, m);
                    }
                    break;
                }
                case types::ObjectType::Hash: {
                    auto pairs = obj.hash_getall();
                    write_varint(out, crc, pairs.size());
                    for (const auto &[f, v] : pairs) {
                        write_string(out, crc, f);
                        write_string(out, crc, v);
                    }
                    break;
                }
                case types::ObjectType::ZSet: {
                    auto range = obj.zset_range(0, std::numeric_limits<std::size_t>::max());
                    write_varint(out, crc, range.size());
                    for (const auto &[member, score] : range) {
                        write_buf(out, crc, &score, sizeof(score));
                        write_string(out, crc, member);
                    }
                    break;
                }
                }
            });
        } while (cursor != 0);
    }

    // 3. Write EOF Opcode
    std::uint8_t eof_op = static_cast<std::uint8_t>(Opcode::Eof);
    write_buf(out, crc, &eof_op, 1);

    // 4. Write final 8-byte CRC64
    write_buf(out, crc, &crc, sizeof(crc));

    out.flush();
    out.close();

    // Atomic rename
    std::error_code ec;
    std::filesystem::rename(tmp_filepath, filepath, ec);
    if (ec) {
        REDISX_LOG_ERROR("Failed to rename temp snapshot to %s: %s", filepath.c_str(), ec.message().c_str());
        return false;
    }

    return true;
}

} // namespace redisx::persistence
