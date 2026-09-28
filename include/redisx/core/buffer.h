#ifndef REDISX_CORE_BUFFER_H
#define REDISX_CORE_BUFFER_H

#include <span>
#include <string_view>
#include <vector>
#include <cstdint>
#include <cstddef>

namespace redisx::core {

/**
 * Buffer Growth and Compaction Strategy:
 *
 * 1. Data Layout:
 *    A single contiguous memory region managed by std::vector<uint8_t> with two cursors:
 *      [ 0 ... read_pos_ ... write_pos_ ... capacity_ ]
 *      - [0, read_pos_)        : Consumed bytes (garbage area).
 *      - [read_pos_, write_pos_) : Unread / readable payload.
 *      - [write_pos_, capacity_) : Available writable capacity.
 *
 * 2. Compaction Strategy:
 *    To maintain amortized O(1) append performance without unbounded memory growth:
 *    - When read_pos_ reaches or exceeds COMPACTION_THRESHOLD (default 1024 bytes) AND
 *      read_pos_ >= (capacity / 2), unread bytes are shifted to index 0 using std::memmove.
 *    - read_pos_ is reset to 0, and write_pos_ is updated to readable_bytes().
 *    - Compaction runs in O(N_readable) time, amortized over all reads/writes.
 *
 * 3. Exponential Growth Strategy:
 *    - When append() requires more writable capacity than available, reserve() doubles capacity
 *      (or expands to fit the requested payload), preventing quadratic reallocations.
 *    - If read space can accommodate the new payload upon compaction, compaction is attempted
 *      first before reallocating memory.
 */
class Buffer {
  public:
    static constexpr size_t DEFAULT_INITIAL_CAPACITY = 1024;
    static constexpr size_t COMPACTION_THRESHOLD = 1024;

    explicit Buffer(size_t initial_capacity = DEFAULT_INITIAL_CAPACITY);
    ~Buffer() = default;

    Buffer(const Buffer &) = default;
    Buffer &operator=(const Buffer &) = default;
    Buffer(Buffer &&) noexcept = default;
    Buffer &operator=(Buffer &&) noexcept = default;

    // Readable capacity & pointers
    [[nodiscard]] size_t readable_bytes() const noexcept {
        return write_pos_ - read_pos_;
    }

    [[nodiscard]] const uint8_t *readable_data() const noexcept {
        return buf_.data() + read_pos_;
    }

    [[nodiscard]] std::string_view peek_string_view() const noexcept {
        return {reinterpret_cast<const char *>(readable_data()), readable_bytes()};
    }

    [[nodiscard]] std::span<const uint8_t> peek(size_t len) const noexcept {
        size_t actual_len = std::min(len, readable_bytes());
        return {readable_data(), actual_len};
    }

    // Writable capacity & pointers
    [[nodiscard]] size_t writable_bytes() const noexcept {
        return buf_.size() - write_pos_;
    }

    [[nodiscard]] uint8_t *writable_data() noexcept {
        return buf_.data() + write_pos_;
    }

    [[nodiscard]] size_t capacity() const noexcept {
        return buf_.size();
    }

    [[nodiscard]] size_t read_offset() const noexcept {
        return read_pos_;
    }

    // Mutators
    void reserve(size_t additional_bytes);
    void append(const void *data, size_t len);
    void append(std::string_view sv);
    void produce(size_t len) noexcept;
    void consume(size_t len) noexcept;
    void compact() noexcept;
    void clear() noexcept;

  private:
    std::vector<uint8_t> buf_;
    size_t read_pos_{0};
    size_t write_pos_{0};
};

} // namespace redisx::core

#endif // REDISX_CORE_BUFFER_H
