# RedisX Persistence Specification (Stage 7)

## Overview

RedisX provides dual durability mechanisms:
1. **RDB Binary Snapshots**: Point-in-time binary dumps with CRC64 checksum validation.
2. **Append-Only File (AOF)**: Real-time RESP command logging with background log compaction (`BGREWRITEAOF`).

---

## 1. RDB Binary Snapshot Layout

```text
+------------------+------------------+-------------------+-----------------+
| Magic ("REDISX") | Version ("0002") | Record Stream...  | EOF Opcode (FF) |
|     6 bytes      |     4 bytes      | Variable length   |     1 byte      |
+------------------+------------------+-------------------+-----------------+
| 8-byte CRC64 Checksum               |
+-------------------------------------+
```

### Record Format

```text
[OPCODE] [TTL_EXPIRE_MS (Optional)] [RDB_TYPE_BYTE] [KEY_VARINT] [KEY_BYTES] [VALUE_PAYLOAD]
```

### Opcode Mapping
- `0xFA`: AUX metadata field
- `0xFC`: 8-byte millisecond TTL timestamp follows
- `0xFE`: Database index selector follows (VarInt length)
- `0xFF`: End of file (followed by 8-byte CRC64)

### Type Byte Mapping
- `0`: String
- `1`: List
- `2`: Hash
- `3`: Set
- `4`: ZSet

---

## 2. AOF Log Format & `appendfsync` Policies

AOF stores mutations as standard RESP arrays:
```text
*3\r\n$3\r\nSET\r\n$4\r\nkey1\r\n$4\r\nval1\r\n
```

### Sync Policies
- `always`: Flush and `fsync()` after every mutating command.
- `everysec`: Write commands to the OS immediately and call `fsync()` on the recurring maintenance tick, approximately every 1,000 ms. A stalled event loop or OS can delay this.
- `no`: Rely on OS buffer flushing.

---

## 3. Crash Recovery Protocol

1. When append-only persistence is enabled and the configured AOF exists, replay that complete log as the authoritative source. Do not also apply a snapshot, which would double-apply increments and list operations.
2. Otherwise, load the configured snapshot. Verify its full checksum and structure into a temporary keyspace before replacing live databases.
3. With `aof-load-truncated yes`, truncate incomplete tail commands or an incomplete `MULTI` transaction to the last complete boundary before accepting new appends. Unknown commands and malformed data fail recovery.

Snapshots use RedisX's own format, not the Redis RDB format. Version 0002 uses CRC64/Jones; version 0001 remains readable with its historical checksum algorithm. Expiration timestamps are Unix milliseconds. Files use the platform's existing little-endian representation; cross-endian portability is not certified.

`SAVE` is synchronous. `BGSAVE` and `BGREWRITEAOF` use fork snapshots and are reaped by the event loop. Rewrites retain writes made after the fork before atomically replacing and syncing the log. `always` acknowledges only after the append and fsync succeed; disk errors return `MISCONF` and disable subsequent mutations. A failed write may already be visible in memory and must be treated as an uncertain outcome by a client.
