#ifndef REDISX_PERSISTENCE_FORMAT_H
#define REDISX_PERSISTENCE_FORMAT_H

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace redisx::persistence {

// File header signatures
inline constexpr std::string_view RDB_MAGIC = "REDISX";
inline constexpr std::string_view RDB_VERSION = "0001";

// RDB Opcodes
enum class Opcode : std::uint8_t {
    Aux          = 0xFA, // Metadata pair
    ExpireMs     = 0xFC, // 8-byte millisecond timestamp
    SelectDb     = 0xFE, // Database index
    Eof          = 0xFF  // End of file marker
};

// RDB Object Type tags
enum class RdbType : std::uint8_t {
    String = 0,
    List   = 1,
    Hash   = 2,
    Set    = 3,
    ZSet   = 4
};

// Standard Redis CRC64 Polynomial (64-bit IEEE)
inline std::uint64_t crc64(std::uint64_t crc, const void *buf, std::size_t len) noexcept {
    static const std::uint64_t table[256] = {
        0x0000000000000000ULL, 0x7ad870c830358973ULL, 0xf5b0e190606b12e6ULL, 0x8f689158505e9b95ULL,
        0xf66136bf30d625cdULL, 0x8cb9467700e3acbeULL, 0x03d1d72f50bd372bULL, 0x7909a7e76088be58ULL,
        0xedc26d7e61ad4b9aULL, 0x971a1db65198c2edULL, 0x18728cee01c6597cULL, 0x62aafc2631f3d00fULL,
        0x1ba35bc1517b6e57ULL, 0x617b2b09614ee724ULL, 0xee13ba5131107cb1ULL, 0x94cbca990125f5c2ULL,
        0x7b84dbfcc35a9735ULL, 0x015ca834f36f1e46ULL, 0x8e343a6ca33185d3ULL, 0xf4ec4aa493040ca0ULL,
        0x8de5ed43f38cb2f8ULL, 0xf73d9d8bc3b93b8bULL, 0x78550cd393e7a01eULL, 0x028d7c1ba3d2296dULL,
        0x9646b682a2f7dcafULL, 0xec9ec64a92c255dcULL, 0x63f65712c29cc449ULL, 0x192e27dafed94d3aULL,
        0x6027803d9221f962ULL, 0x1afff0f5a2147011ULL, 0x959761adfe4aeb84ULL, 0xef4f1165ce7f62f7ULL,
        0xf709b7f986b52e6aULL, 0x8dd1c731b680a719ULL, 0x02b95669e6de3c8cULL, 0x786126a1d6ebb5ffULL,
        0x01688146b6630ba7ULL, 0x7bb0f18e865682d4ULL, 0xf4d860d6d6081941ULL, 0x8e00101ee63d9032ULL,
        0x1acbd687e71865f0ULL, 0x6013a64fd72decc3ULL, 0xef7b371787737716ULL, 0x95a347dfb746fe65ULL,
        0xecaaed38d7ce403dULL, 0x96729df0e7fbcf4eULL, 0x191a0ca8b7a552dbULL, 0x63c27c608790dba8ULL,
        0x8c8d6c0545efb95fULL, 0xf6551cc075da302cULL, 0x793d8d952584abb9ULL, 0x03e5fd5d15b122caULL,
        0x7aec5ab075399c92ULL, 0x00342a78450c15e1ULL, 0x8f5cbbed15528e74ULL, 0xf584cb2525670707ULL,
        0x614f017b2442f2c5ULL, 0x1b9771b314777bb6ULL, 0x94ffefeb4429e023ULL, 0xee279f23741c6950ULL,
        0x972e37c41494d708ULL, 0xedfe470c24a15e7bULL, 0x629ed65474ffc5eeULL, 0x1846a69c44caec9dULL,
        0xef136e930d6a5cceULL, 0x95cb1e5b3d5fdcb7ULL, 0x1aa38fc36d014e28ULL, 0x607bfedb5d34c75bULL,
        0x1972582c3dbf7903ULL, 0x63aa28e40d8af070ULL, 0xecceb9bc5dd46be5ULL, 0x9616c9746de1e296ULL,
        0x02d103ed6cc71754ULL, 0x780973255cf29e27ULL, 0xf761e27d0ca905b2ULL, 0x8db992b53c9c8cc1ULL,
        0xf4b035525c113299ULL, 0x8e68459a6c24bbeaULL, 0x0100d4c23c7a207fULL, 0x7bd8a40a0c4fa90cULL,
        0x0949b56fceef0cbbULL, 0xed93c637fe8542c8ULL, 0x612bb76cae8b1e5dULL, 0x1bf3c7a49ebe972eULL,
        0x62f86040fe392976ULL, 0x18201088ce0ca005ULL, 0x974881d09e523b90ULL, 0xed90f118ae67b2e3ULL,
        0x798bca11af428721ULL, 0x0353ba499f770e52ULL, 0x8c3b2b81cf2995c7ULL, 0xf6e35b49ff1c1cb4ULL,
        0x8feaecae9f94a2ecULL, 0xf5329c66af912b9fULL, 0x7a5a0d3effffb00aULL, 0x00827df6cfca3979ULL,
        0x181ad96a8bd772a4ULL, 0x62c2a9a2bbe2fbd7ULL, 0xedaa38faebd86042ULL, 0x97724832dbed4931ULL,
        0xee7bead5bb015769ULL, 0x94a39a1d8b34de1aULL, 0x1bcb0b45db6a458fULL, 0x61137b8deb5fccecULL,
        0xf5d8b414ea7a393eULL, 0x8f00c4dcba4fb04dULL, 0x006855848a112bd8ULL, 0x7ab0254cb244a2abULL,
        0x03b982abdaac1cf3ULL, 0x7961f263ea999580ULL, 0xf609633bbac70e15ULL, 0x8cd113f38af28766ULL,
        0x639e0296488de591ULL, 0x1946725e78b86ce2ULL, 0x962ec30628e6f777ULL, 0xecf6b3ce18d37e04ULL,
        0x95ff3429785bc05cULL, 0xef2744e1486e492fULL, 0x604fd5b91830d2baULL, 0x1a97a57128055bc9ULL,
        0x8e5c6fe82920ae0bULL, 0xf4841f2019152778ULL, 0x7becced8494abcedULL, 0x0134be10797f359eULL,
        0x783d595719f68bc6ULL, 0x02e5299f29c302b5ULL, 0x8d8db8c7799d9920ULL, 0xf755c80f49a81053ULL
    };

    const auto *bytes = static_cast<const std::uint8_t *>(buf);
    std::uint64_t res = crc;
    for (std::size_t i = 0; i < len; ++i) {
        res = table[(res ^ bytes[i]) & 0xFF] ^ (res >> 8);
    }
    return res;
}

// Helpers for Redis-style variable-length integer encoding
inline void encode_varint(std::vector<std::uint8_t> &buf, std::size_t len) {
    if (len < 64) {
        buf.push_back(static_cast<std::uint8_t>(len));
    } else if (len < 16384) {
        buf.push_back(static_cast<std::uint8_t>(0x40 | (len >> 8)));
        buf.push_back(static_cast<std::uint8_t>(len & 0xFF));
    } else {
        buf.push_back(0x80);
        buf.push_back(static_cast<std::uint8_t>((len >> 24) & 0xFF));
        buf.push_back(static_cast<std::uint8_t>((len >> 16) & 0xFF));
        buf.push_back(static_cast<std::uint8_t>((len >> 8) & 0xFF));
        buf.push_back(static_cast<std::uint8_t>(len & 0xFF));
    }
}

inline bool decode_varint(const std::uint8_t *data, std::size_t size, std::size_t &offset, std::size_t &out_len) {
    if (offset >= size) return false;
    std::uint8_t first = data[offset++];
    std::uint8_t type = (first & 0xC0) >> 6;

    if (type == 0) {
        out_len = first & 0x3F;
        return true;
    } else if (type == 1) {
        if (offset >= size) return false;
        std::uint8_t second = data[offset++];
        out_len = ((static_cast<std::size_t>(first & 0x3F)) << 8) | second;
        return true;
    } else if (type == 2) {
        if (offset + 4 > size) return false;
        out_len = (static_cast<std::size_t>(data[offset]) << 24) |
                  (static_cast<std::size_t>(data[offset + 1]) << 16) |
                  (static_cast<std::size_t>(data[offset + 2]) << 8) |
                  static_cast<std::size_t>(data[offset + 3]);
        offset += 4;
        return true;
    }
    return false;
}

} // namespace redisx::persistence

#endif // REDISX_PERSISTENCE_FORMAT_H
