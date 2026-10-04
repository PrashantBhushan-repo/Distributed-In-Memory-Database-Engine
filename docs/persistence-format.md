# RedisX Persistence Specification (Stage 7)

## Overview

RedisX provides dual durability mechanisms:
1. **RDB Binary Snapshots**: Point-in-time binary dumps with CRC64 checksum validation.
2. **Append-Only File (AOF)**: Real-time RESP command logging with background log compaction (`BGREWRITEAOF`).

---

## 1. RDB Binary Snapshot Layout

```text
+------------------+------------------+-------------------+-----------------+
| Magic ("REDISX") | Version ("0001") | Record Stream...  | EOF Opcode (FF) |
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
- `2`: Set
- `3`: ZSet
- `4`: Hash

---

## 2. AOF Log Format & `appendfsync` Policies

AOF stores mutations as standard RESP arrays:
```text
*3\r\n$3\r\nSET\r\n$4\r\nkey1\r\n$4\r\nval1\r\n
```

### Sync Policies
- `always`: Flush and `fsync()` after every mutating command.
- `everysec`: Buffer writes and trigger `fsync()` every 1,000 ms.
- `no`: Rely on OS buffer flushing.

---

## 3. Crash Recovery Protocol

1. Load snapshot file (`dump.rdb`) if present and verify CRC64 checksum.
2. Replay AOF log (`appendonly.aof`) through the RESP parser.
3. If `aof-load-truncated` is enabled, partial tail commands resulting from unclean shutdowns are logged with a warning and skipped cleanly.
