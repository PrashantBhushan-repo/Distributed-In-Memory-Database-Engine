# RedisX Architecture — Stage 0 & Stage 1

RedisX is an industry-level, high-performance, Redis-compatible in-memory database built in C++20.

## Overview Diagram

```text
               +----------------------------------+
               |         RedisX Client            |
               |  (redis-cli / redis-benchmark)   |
               +----------------------------------+
                                |
                                |  TCP Connection
                                v
               +----------------------------------+
               |        redisx::net::Listener     |
               | (Non-blocking Accept, MaxClients)|
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               |      redisx::net::Connection     |
               |   - Input Buffer (Grow/Compact)  |
               |   - Output Buffer (EPOLLOUT)     |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               |      redisx::net::EventLoop      |
               |   - epoll (Level-Triggered)      |
               |   - Dynamic Timer Wheel          |
               |   - Deferred Teardown Queue      |
               +----------------------------------+
```

## Core Components

1. **redisx::core::Buffer**:
   - Growable byte buffer with `read_pos_` and `write_pos_` cursors.
   - Amortized O(1) appends with automatic memory compaction when read cursor passes configurable threshold (`COMPACTION_THRESHOLD`).
   - Zero heap allocation on hot-path reads.

2. **redisx::core::Logger**:
   - Thread-safe level-based logger (`TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`).
   - Zero heap allocation for log messages under 256 bytes using stack formatting.

3. **redisx::core::ITimeProvider**:
   - Monotonic and wall clock abstraction layer allowing deterministic time control via `MockTimeProvider` in tests.

4. **redisx::net::EventLoop**:
   - Epoll wrapper supporting level-triggered socket events (`EPOLLIN`, `EPOLLOUT`, `EPOLLHUP`, `EPOLLERR`).
   - Min-heap sorted timer management with dynamic `epoll_wait` timeout computation.
   - Deferred teardown queue preventing iteration invalidation during socket closures.

5. **redisx::net::Listener**:
   - Non-blocking socket listener supporting `SO_REUSEADDR` and `SO_REUSEPORT`.
   - Bounded accept loop (`DEFAULT_MAX_ACCEPTS_PER_TICK`) preventing event loop starvation under connection spikes.
   - Enforces `max_clients` limit with automatic rejection error response.

6. **redisx::net::Connection**:
   - Client socket state machine with input/output `Buffer` ownership.
   - Dynamic `EPOLLOUT` event registration only when output buffer contains un-flushed bytes.
   - Bounded read/write processing per tick (`MAX_READ_BATCH_BYTES` = 64KB) protecting event loop responsiveness.