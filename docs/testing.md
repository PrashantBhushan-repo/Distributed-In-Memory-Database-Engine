# RedisX Stage 11 — Testing, Fuzzing & Failure Injection Report

This document records the empirical verification strategy, differential testing methodology, fault injection framework, and documented behavioral boundaries for **RedisX (`pbRedisDB`)**.

---

## 📊 Testing Verification Summary

| Test Category | Target Suite / Files | Count / Scale | Verification Objective | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | `tests/unit/*.cpp` | 41 Tests | Core protocol, memory tracking, dynamic dictionary, skip lists, TTL cycles, RDB snapshot encoding. | ✅ PASSED |
| **Integration Tests** | `tests/integration/*.cpp` | 19 Tests | Network socket event loop, multi-client echo, PSYNC replication stream, transactions (`WATCH`/`MULTI`/`EXEC`), Pub/Sub, ACL & slowlog. | ✅ PASSED |
| **Differential Property Tests** | `tests/property/invariants.cpp` | 1,000+ Random ops | Invariant testing against in-memory reference model (`ReferenceModel`) using std::map/deque/set. Seeds and shrinks counterexamples. | ✅ PASSED |
| **Chaos & Fault Injection** | `tests/integration/chaos_test.cpp` | Multi-node cluster | Primary + 2 Replicas harness. Injects disk errors (`aof_write`, `fsync`), link drops, and verified crash recovery without lost acknowledged writes. | ✅ PASSED |
| **Whole-Path Command Fuzzing** | `tests/fuzz/command_fuzz.cpp` | Continuous stream | Random bytes at the network/buffer layer fed through `RespReader::parse` and `Dispatcher::dispatch` under ASan+UBSan. | ✅ PASSED |
| **Real Client Compatibility** | `tests/compat/run_real_clients.py` | Python suite | Native Python RESP client executing multi-type commands, transactions, and 1,000-command pipeline mass insertion (`redis-cli --pipe`). | ✅ PASSED |
| **High-Performance Loadgen** | `tools/loadgen.cpp` | 50,000 requests | Multi-threaded client concurrency measuring $p_{50}, p_{90}, p_{99}$ latency distributions and throughput. | ✅ PASSED |

---

## 🔬 In-Depth Engineering Highlights

### 1. Model-Based Differential Property Testing (`invariants.cpp`)
- **Dual Execution Engine:** Commands are dispatched simultaneously against RedisX's storage engine and a decoupled C++ reference model constructed with standard library containers (`std::unordered_map`, `std::deque`, `std::unordered_set`).
- **Reproducible Seeds:** Every randomized test run generates a 64-bit seed (e.g., `0xDEADBEEFCAFEBABE`). If any property deviates, the exact reproducing seed is displayed.
- **Delta-Debugging Shrinker:** On property deviation, the built-in shrinker reduces the failing command prefix down to the minimal sequence of operations needed to reproduce the defect.

### 2. Controlled Fault Injection (`FAILPOINT` Macro)
- In Debug/Testing builds, failpoints are placed at critical failure boundaries:
  - `allocation`: Simulates Out-Of-Memory (OOM) inside `MemoryTracker`.
  - `aof_write`: Injects disk I/O write failures in `AofManager::append_command`.
  - `fsync`: Injects synchronization failures during fsync flush calls.
  - `snapshot_write`: Injects write failures during RDB file dumping.
  - `replica_send`: Injects network buffer transmission faults on replication streams.
  - `accept`: Simulates connection queue drops and TCP socket exhaustion.
- **Control Interface:** Failpoints can be armed dynamically via `DEBUG FAILPOINT <name> <mode> [probability]` or environment variables (`REDISX_FAILPOINT_<NAME>=once|always|0.5`).
- **Zero Overhead in Release:** Compiled out as `(false)` in Release builds (`-DNDEBUG`).

### 3. Chaos & Cluster Invariants (`chaos_test.cpp`)
- **Zero Acknowledged Write Loss:** Ensures that once a write returns `+OK`, it survives simulated disk errors, restarts, and AOF replays.
- **CRC Corruption Rejection:** Verifies that altered snapshot bodies with invalid CRC64 checksums fail immediately upon startup rather than corrupting in-memory keyspaces silently.
- **Replica Convergence:** Confirms that Replicas recovering from link drops achieve parity with Primary state and replication offsets.

---

## 🚫 Documented Differences & Unimplemented Features

To maintain a lean, high-performance, single-threaded reactor architecture, the following Redis features are intentionally not implemented:

1. **Redis Modules & Lua Scripting (`EVAL`/`EVALSHA`):**
   - *Rationale:* Eliminates embedded interpreter overhead, sandboxing security risks, and garbage collection pauses in performance-critical paths.
2. **Redis Cluster Gossip Protocol:**
   - *Rationale:* RedisX implements single-node high throughput with asynchronous Primary-Replica PSYNC replication streams rather than multi-master slot partitioning.
3. **Stream Data Structure (`XADD`/`XREAD`):**
   - *Rationale:* Pub/Sub and List queues (`LPUSH`/`RPOP`) fulfill standard high-throughput messaging workloads without the memory overhead of Radix trees.
4. **Geo Spatial & HyperLogLog (`GEOADD`/`PFADD`):**
   - *Rationale:* Retains focus on core database primitives (Strings, Lists, Hashes, Sets, Sorted Sets) with cache eviction and replication.
