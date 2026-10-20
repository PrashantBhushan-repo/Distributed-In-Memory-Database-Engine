#include "redisx/core/buffer.h"
#include "redisx/proto/resp_reader.h"

#include <cstddef>
#include <cstdint>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
    if (size == 0 || size > 1024 * 1024) {
        return 0;
    }

    redisx::core::Buffer buf;
    buf.append(data, size);

    while (buf.readable_bytes() > 0) {
        auto res = redisx::proto::RespReader::parse(buf);
        if (res.is_error() || !res.value().has_value()) {
            break;
        }
    }

    redisx::proto::StreamingRespReader streaming;
    redisx::core::Buffer fragmented;
    for (std::size_t offset = 0; offset < size;) {
        const auto chunk = std::min<std::size_t>(1 + data[offset] % 64, size - offset);
        fragmented.append(data + offset, chunk); offset += chunk;
        while (true) {
            const auto result = streaming.parse(fragmented);
            if (result.is_error()) return 0;
            if (!result.value()) break;
        }
    }
    return 0;
}
