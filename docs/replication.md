# RedisX Replication Architecture

This document details the replication architecture of **RedisX** (Stage 8), covering asynchronous primary-to-replica streaming, deterministic command rewriting, the circular backlog buffer, partial resynchronization (PSYNC), and replica state handshakes.

---

## 1. Overview

RedisX implements asynchronous single-primary multi-replica replication compatible with standard Redis client protocol mechanics (`redis-cli`, `redis-py`). Replicas provide horizontal read scalability and failover state redundancy.

### Core Properties
* **Asynchronous Streaming**: The primary executes write commands and streams them to connected replicas with non-blocking write buffering.
* **Deterministic Execution Effect**: Commands that depend on non-deterministic server state (such as `EXPIRE`, `SETEX`, `SPOP`, `INCRBYFLOAT`) are transformed into deterministic execution effects before propagation.
* **Partial Resynchronization (`PSYNC`)**: Interrupted replication links resume streaming from a circular memory backlog buffer without executing a costly full keyspace snapshot (`FULLRESYNC`) whenever possible.
* **Read-Only Replicas**: Replicas reject client mutation requests and delegate expiration deletions strictly to primary-propagated explicit `DEL` commands.

---

## 2. Replication Offsets & IDs

Each RedisX instance maintains a `ReplIdManager`:
- **`master_replid`**: A 40-character pseudo-random hex string generated at startup representing the current execution sequence history.
- **`master_repl_offset`**: A monotonically increasing 64-bit unsigned integer counter reflecting total stream bytes produced.
- **`replid2` & `second_replid_offset`**: Historical ID and offset preserved during role transitions (e.g. replica promotion).

---

## 3. Circular Backlog Buffer (`ReplBacklog`)

Primary nodes maintain a fixed-capacity circular memory buffer (`repl-backlog-size`, default 1 MB):
- Holds recent outbound RESP stream bytes.
- Tracks `first_byte_offset` and `master_repl_offset`.
- Evaluates `can_partial_resync(req_replid, req_offset)`:
  - Validates `req_replid == master_replid` (or `replid2`).
  - Asserts `first_byte_offset <= req_offset <= master_repl_offset + 1`.

If valid, primary sends `+CONTINUE <master_replid>\r\n` followed by backlog stream bytes.

---

## 4. Deterministic Command Rewriting (`ReplStream`)

To guarantee strict state equality between primary and replica keyspaces, non-deterministic operations undergo transformation before being written to the backlog or transmitted:

| Original Client Command | Rewritten Outbound Propagation Stream |
| :--- | :--- |
| `EXPIRE key 10` | `PEXPIREAT key <current_time_ms + 10000>` |
| `SETEX key 10 val` | `SET key val` followed by `PEXPIREAT key <current_time_ms + 10000>` |
| `INCRBYFLOAT key 2.5` | `SET key <computed_exact_float_string>` |
| `SPOP key` | `SREM key <popped_member_string>` |
| Lazy/Active Key Expiry | Explicit synthetic `DEL key` |

---

## 5. Replica Handshake State Machine (`ReplicaLink`)

Replicas initiate non-blocking handshakes to primary instances using the following state sequence:

```
[OFFLINE] 
   │
   ▼
[CONNECTING] ───────────────► Non-blocking TCP connect
   │
   ▼
[HANDSHAKE_PING] ──────────► Send "PING", expect "+PONG"
   │
   ▼
[HANDSHAKE_PORT] ──────────► Send "REPLCONF listening-port <port>", expect "+OK"
   │
   ▼
[HANDSHAKE_CAPA] ──────────► Send "REPLCONF capa eof", expect "+OK"
   │
   ▼
[HANDSHAKE_PSYNC] ─────────► Send "PSYNC <replid> <offset>"
   │
   ├─── "+CONTINUE" ───────► [STREAMING] (Resume backlog stream directly)
   │
   └─── "+FULLRESYNC" ─────► [RECEIVING_SNAPSHOT] ──► Parse Snapshot ──► [STREAMING]
```

---

## 6. Verification & Commands

* **`REPLICAOF <host> <port>`**: Configures instance as a replica of `host:port`.
* **`REPLICAOF NO ONE`**: Promotes instance to standalone primary.
* **`PSYNC <replid> <offset>`**: Initiates partial or full synchronization.
* **`WAIT <numreplicas> <timeout_ms>`**: Blocks until $N$ replicas confirm stream offset reachability.
* **`INFO replication`**: Displays replication role, offset, lag, and backlog state metrics.
