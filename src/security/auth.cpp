#include "redisx/security/auth.h"
#include "redisx/proto/resp_writer.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <sstream>

namespace redisx::security {

namespace {

// SHA-256 Implementation
constexpr std::array<std::uint32_t, 64> K = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

inline std::uint32_t rotr(std::uint32_t x, std::uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

} // namespace

std::string sha256_hex(std::string_view input) {
    std::uint32_t h0 = 0x6a09e667;
    std::uint32_t h1 = 0xbb67ae85;
    std::uint32_t h2 = 0x3c6ef372;
    std::uint32_t h3 = 0xa54ff53a;
    std::uint32_t h4 = 0x510e527f;
    std::uint32_t h5 = 0x9b05688c;
    std::uint32_t h6 = 0x1f83d9ab;
    std::uint32_t h7 = 0x5be0cd19;

    std::uint64_t bit_len = input.size() * 8;
    std::vector<std::uint8_t> msg(input.begin(), input.end());
    msg.push_back(0x80);

    while ((msg.size() % 64) != 56) {
        msg.push_back(0x00);
    }

    for (int i = 7; i >= 0; --i) {
        msg.push_back(static_cast<std::uint8_t>((bit_len >> (i * 8)) & 0xff));
    }

    for (std::size_t offset = 0; offset < msg.size(); offset += 64) {
        std::uint32_t w[64];
        for (std::size_t i = 0; i < 16; ++i) {
            w[i] = (static_cast<std::uint32_t>(msg[offset + i * 4]) << 24) |
                   (static_cast<std::uint32_t>(msg[offset + i * 4 + 1]) << 16) |
                   (static_cast<std::uint32_t>(msg[offset + i * 4 + 2]) << 8) |
                   (static_cast<std::uint32_t>(msg[offset + i * 4 + 3]));
        }

        for (std::size_t i = 16; i < 64; ++i) {
            std::uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            std::uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        std::uint32_t a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

        for (std::size_t i = 0; i < 64; ++i) {
            std::uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            std::uint32_t ch = (e & f) ^ ((~e) & g);
            std::uint32_t temp1 = h + S1 + ch + K[i] + w[i];
            std::uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            std::uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            std::uint32_t temp2 = S0 + maj;

            h = g;
            g = f;
            f = e;
            e = d + temp1;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2;
        }

        h0 += a; h1 += b; h2 += c; h3 += d;
        h4 += e; h5 += f; h6 += g; h7 += h;
    }

    std::ostringstream ss;
    ss << std::hex << std::setfill('0')
       << std::setw(8) << h0 << std::setw(8) << h1
       << std::setw(8) << h2 << std::setw(8) << h3
       << std::setw(8) << h4 << std::setw(8) << h5
       << std::setw(8) << h6 << std::setw(8) << h7;
    return ss.str();
}

bool constant_time_equals(std::string_view a, std::string_view b) noexcept {
    if (a.size() != b.size()) return false;
    unsigned char result = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        result |= static_cast<unsigned char>(a[i] ^ b[i]);
    }
    return result == 0;
}

void AuthEngine::set_requirepass(std::string password) {
    requirepass_ = std::move(password);
    requirepass_hash_ = requirepass_.empty() ? "" : sha256_hex(requirepass_);
}

bool AuthEngine::authenticate(std::string_view password) const {
    if (requirepass_.empty()) return true;
    std::string hash = sha256_hex(password);
    return constant_time_equals(hash, requirepass_hash_);
}

bool AuthEngine::is_command_allowed_unauthenticated(std::string_view cmd_name) const {
    std::string name(cmd_name);
    std::transform(name.begin(), name.end(), name.begin(), ::toupper);
    return (name == "AUTH" || name == "HELLO" || name == "QUIT" || name == "RESET");
}

void register_auth_commands(commands::Dispatcher &dispatcher, AuthEngine &auth_engine) {
    // AUTH [username] password
    dispatcher.register_command({"AUTH", -2, commands::CMD_FLAG_READONLY, [&auth_engine](
                                                                                const proto::Command &cmd,
                                                                                db::Keyspace &,
                                                                                std::size_t,
                                                                                core::Buffer &out_buf,
                                                                                std::size_t &
                                                                            ) {
        std::string password = (cmd.arg_count() >= 3) ? cmd.arg(2) : cmd.arg(1);
        if (!auth_engine.is_auth_required()) {
            proto::RespWriter::write_error(out_buf, "ERR Client sent AUTH, but no password is set");
            return;
        }
        if (auth_engine.authenticate(password)) {
            proto::RespWriter::write_simple_string(out_buf, "OK");
        } else {
            proto::RespWriter::write_error(out_buf, "WRONGPASS Invalid username-password pair or user is disabled.");
        }
    }});
}

} // namespace redisx::security
