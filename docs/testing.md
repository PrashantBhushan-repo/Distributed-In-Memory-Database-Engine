# Engine validation

See [engine-audit.md](engine-audit.md) for the current stage-by-stage audit and exact executed checks. Historical claims below predate the audit; the C++ chaos harness simulates replication in process and is not evidence of a multi-process cluster run. `run_real_clients.py` is a socket smoke test; `real_client_audit.py` invokes actual client libraries/tools. Sanitizer and fuzz results apply only to the audited build and exercised inputs.

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
