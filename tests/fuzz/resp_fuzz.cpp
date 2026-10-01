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

    return 0;
}
