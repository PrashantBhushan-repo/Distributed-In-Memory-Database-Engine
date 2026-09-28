#include "redisx/core/buffer.h"

#include <algorithm>
#include <cstring>

namespace redisx::core {

Buffer::Buffer(size_t initial_capacity) : buf_(std::max(initial_capacity, size_t(1))) {}

void Buffer::compact() noexcept {
    if (read_pos_ == 0) {
        return;
    }
    size_t unread = readable_bytes();
    if (unread > 0) {
        std::memmove(buf_.data(), buf_.data() + read_pos_, unread);
    }
    read_pos_ = 0;
    write_pos_ = unread;
}

void Buffer::reserve(size_t additional_bytes) {
    if (writable_bytes() >= additional_bytes) {
        return;
    }

    // Attempt compaction first if reclaiming read area suffices
    if (read_pos_ + writable_bytes() >= additional_bytes) {
        compact();
        return;
    }

    // Need exponential reallocation
    size_t needed = write_pos_ + additional_bytes;
    size_t new_cap = std::max(buf_.size() * 2, needed);
    buf_.resize(new_cap);
}

void Buffer::append(const void *data, size_t len) {
    if (len == 0 || data == nullptr) {
        return;
    }
    reserve(len);
    std::memcpy(writable_data(), data, len);
    produce(len);
}

void Buffer::append(std::string_view sv) {
    append(sv.data(), sv.size());
}

void Buffer::produce(size_t len) noexcept {
    write_pos_ = std::min(write_pos_ + len, buf_.size());
}

void Buffer::consume(size_t len) noexcept {
    size_t actual_consume = std::min(len, readable_bytes());
    read_pos_ += actual_consume;

    if (read_pos_ == write_pos_) {
        // Buffer is empty, reset cursors for optimal memory layout
        read_pos_ = 0;
        write_pos_ = 0;
    } else if (read_pos_ >= COMPACTION_THRESHOLD && read_pos_ >= (buf_.size() / 2)) {
        // Run compaction when read threshold is met
        compact();
    }
}

void Buffer::clear() noexcept {
    read_pos_ = 0;
    write_pos_ = 0;
}

} // namespace redisx::core
