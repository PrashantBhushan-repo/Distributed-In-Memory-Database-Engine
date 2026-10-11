# Changelog

All notable changes to **RedisX (`pbRedisDB`)** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-11

### Added
- **Core Architecture & Event Loop (Stage 0 - 2):**
  - Non-blocking Linux `epoll` reactor event loop with level-triggered I/O and dynamic timer wheel.
  - Zero-copy growing byte buffer (`Buffer`) with automated read-cursor compaction.
  - Complete zero-copy RESP2 and RESP3 protocol reader/writer (`RespReader`, `RespWriter`).
- **Data Structures & Encodings (Stage 3 - 5):**
  - Hash table (`Dict`) with incremental step-by-step background rehashing.
  - Compact memory representations: `Listpack` (contiguous variable-length encoding) and `Intset` (sorted dynamic bit-width integer array).
  - High-performance `SkipList` for Sorted Sets with probabilistic level generation and logarithmic rank operations.
  - `QuickList` node-linked listpack structure for Lists.
  - Active and passive TTL expiration manager (`TTLManager`) with millisecond precision.
- **Memory Management & Persistence (Stage 6 - 8):**
  - Real-time heap memory tracker (`MemoryTracker`) enforcing `maxmemory` limits.
  - Configurable eviction algorithms: Sample-based `volatile-lru`, `allkeys-lru`, `volatile-lfu`, `allkeys-lfu`, `volatile-ttl`, and `random`.
  - Point-in-time binary RDB snapshot serialization and deserialization with 64-bit CRC verification.
  - Append-Only File (AOF) log persistence with configurable `fsync` policies (`always`, `everysec`, `no`).
- **Replication, Transactions & Messaging (Stage 9 - 10):**
  - Master-replica PSYNC replication stream with a circular 1 MB replication backlog buffer and offset recovery.
  - Multi-key transactions supporting `MULTI`, `EXEC`, `DISCARD`, and optimistic locking via `WATCH`/`UNWATCH`.
  - High-throughput Pub/Sub engine supporting pattern subscriptions (`PSUBSCRIBE`/`PUNSUBSCRIBE`).
  - Blocking commands: `BLPOP`, `BRPOP`, and `BRPOPLPUSH` with client wakeup queues.
- **Observability & SRE Telemetry (Stage 10):**
  - Native embedded HTTP OpenMetrics exporter on port `9121` serving Prometheus metrics.
  - 10 SRE Golden Signal Grafana dashboards tracking traffic, saturation, latency, hit ratios, and exporter overhead.
- **Testing, Fuzzing & Fault Injection (Stage 11):**
  - 41 unit tests and 19 integration tests with GoogleTest.
  - Differential model-based property tests (`invariants.cpp`) comparing against decoupled STL reference model with delta-debugging shrinker.
  - Chaos fault injection framework (`FAILPOINT` macro) simulating disk write errors, network partitions, and CRC corruptions.
  - libFuzzer whole-path fuzzing harnesses (`resp_fuzz`, `command_fuzz`) under ASan + UBSan.
- **Performance & Profiling (Stage 12):**
  - Empirical baseline benchmarks reaching **70,871 QPS** for reads, **24,437 QPS** for writes, and **132,837 QPS** under pipelining.
  - `jemalloc` allocator integration for fragmented heap reduction.
  - Performance profiling script (`profile.sh`) using Linux `perf` and flamegraphs.
  - Multi-threaded load generator (`tools/loadgen.cpp`).
- **Packaging & Shipping (Stage 13):**
  - Multi-stage `docker/Dockerfile` producing small stripped runtime image.
  - Unified `docker-compose.yml` orchestrating RedisX, Prometheus, and Grafana with anonymous read-only access.
  - GitHub Actions multi-architecture release workflow for `linux-x64` and `linux-arm64`.
  - Detailed design decisions rationale (`docs/design-decisions.md`).
  - Comprehensive contributor guide (`CONTRIBUTING.md`).
