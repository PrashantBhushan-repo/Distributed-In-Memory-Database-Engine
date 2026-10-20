#include "redisx/core/buffer.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>
#include <limits>

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
    if (additional_bytes > buf_.max_size() - write_pos_) throw std::length_error("buffer capacity exceeded");
    size_t needed = write_pos_ + additional_bytes;
    size_t doubled = buf_.size() > buf_.max_size() / 2 ? buf_.max_size() : buf_.size() * 2;
    size_t new_cap = std::max(doubled, needed);
    buf_.resize(new_cap);
}

void Buffer::append(const void *data, size_t len) {
    if (len == 0 || data == nullptr) {
        return;
    }
    const auto pointer = reinterpret_cast<std::uintptr_t>(data);
    const auto begin = reinterpret_cast<std::uintptr_t>(buf_.data());
    if (pointer >= begin && pointer - begin < buf_.size()) {
        if (len > buf_.size() - (pointer - begin)) throw std::out_of_range("self append exceeds buffer");
        const std::vector<std::uint8_t> copy(static_cast<const std::uint8_t *>(data), static_cast<const std::uint8_t *>(data) + len);
        reserve(len); std::memcpy(writable_data(), copy.data(), len);
    } else { reserve(len); std::memcpy(writable_data(), data, len); }
    produce(len);
}

void Buffer::append(std::string_view sv) {
    append(sv.data(), sv.size());
}

void Buffer::produce(size_t len) noexcept {
    write_pos_ += std::min(len, writable_bytes());
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
