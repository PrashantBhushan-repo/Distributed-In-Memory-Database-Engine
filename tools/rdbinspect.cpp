#include "redisx/persistence/snapshot_reader.h"
#include "redisx/db/keyspace.h"
#include <iostream>
#include <string>

int main(int argc, char **argv) {
    if (argc < 2) {
        std::cerr << "Usage: rdbinspect <rdb-file-path>\n";
        return 1;
    }

    std::string filepath = argv[1];
    std::cout << "[RDBInspect] Inspecting snapshot file: " << filepath << "\n";

    redisx::db::Keyspace keyspace;
    redisx::persistence::SnapshotReader reader;

    auto res = reader.load_snapshot(keyspace, filepath);
    if (res.is_error()) {
        std::cerr << "[RDBInspect] ERROR: Failed to load snapshot file (Error code: "
                  << static_cast<int>(res.error()) << ")\n";
        return 1;
    }

    std::cout << "[RDBInspect] Snapshot validation SUCCESSful! CRC64 OK.\n";
    std::cout << "---------------------------------------------------------\n";

    std::size_t total_keys = 0;
    for (std::size_t db_idx = 0; db_idx < redisx::db::Keyspace::NUM_DATABASES; ++db_idx) {
        const auto &dict = keyspace.get_db(db_idx);
        if (dict.empty()) continue;

        std::cout << "Database [" << db_idx << "] (" << dict.size() << " keys):\n";
        dict.scan(0, [&](const redisx::db::Entry *entry) {
            if (!entry) return;
            total_keys++;
            const auto &obj = entry->value.object();
            std::cout << "  - Key: '" << entry->key << "'"
                      << " | Type: " << redisx::types::to_string(obj.type())
                      << " | Encoding: " << redisx::types::to_string(obj.encoding());
            if (entry->expire_at_ms > 0) {
                std::cout << " | ExpireAt: " << entry->expire_at_ms << "ms";
            }
            std::cout << "\n";
        });
    }

    std::cout << "---------------------------------------------------------\n";
    std::cout << "Total Keys Restored: " << total_keys << "\n";
    return 0;
}
