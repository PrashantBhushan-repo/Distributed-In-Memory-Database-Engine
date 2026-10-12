export interface PipelineStage {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  category: 'network' | 'protocol' | 'dispatch' | 'storage' | 'system';
  whatItDoes: string;
  whyItExists: string;
  exampleTitle: string;
  exampleSnippet: string;
  liveMetricFields: Array<{
    label: string;
    key: string;
    formatter?: (val: any) => string;
    fallback?: string;
  }>;
  accessibleDescription: string;
}

export interface RequestAnimationStep {
  stageId: string;
  stepNumber: number;
  title: string;
  narration: string;
  wireBytes?: string;
  dataState?: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'client',
    number: 1,
    title: 'Client Application',
    subtitle: 'SDKs, CLI & Browsers',
    category: 'network',
    whatItDoes:
      'The client (e.g. redis-cli, Jedis, Python redis-py, or pbRedis Studio) encodes human commands into binary RESP protocol bytes and initiates an operating system TCP socket connection.',
    whyItExists:
      'Decouples client applications from database internals. Clients do not need to understand C++ memory layouts—they only speak standardized RESP streams.',
    exampleTitle: 'Client Wire Encoding',
    exampleSnippet: `// redis-cli executes: SET user:101 "Alice"
// Serialized into 33 TCP bytes:
*3\\r\\n$3\\r\\nSET\\r\\n$8\\r\\nuser:101\\r\\n$5\\r\\nAlice\\r\\n`,
    liveMetricFields: [
      { label: 'Connected Clients', key: 'connected_clients', fallback: '1' },
      { label: 'Total Connections', key: 'total_connections_received', fallback: '12' },
      { label: 'Blocked Clients', key: 'blocked_clients', fallback: '0' },
    ],
    accessibleDescription:
      'Stage 1: Client Application initiates a TCP connection and serializes commands into RESP bytes.',
  },
  {
    id: 'tcp',
    number: 2,
    title: 'TCP Network Server',
    subtitle: 'Socket Listener & Non-blocking I/O',
    category: 'network',
    whatItDoes:
      'Creates a non-blocking TCP server socket on port 6379, binds to 0.0.0.0, sets SO_REUSEADDR and TCP_NODELAY, and buffers incoming wire bytes in kernel sk_buff buffers.',
    whyItExists:
      'Provides high-throughput, low-latency transport. Disabling Nagle algorithm (TCP_NODELAY) ensures individual Redis packets are transmitted immediately without buffering delay.',
    exampleTitle: 'C++ Socket Setup (src/net/socket.cpp)',
    exampleSnippet: `int fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
int opt = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
bind(fd, (sockaddr*)&addr, sizeof(addr));
listen(fd, 128);`,
    liveMetricFields: [
      { label: 'Server Port', key: 'tcp_port', fallback: '6379' },
      { label: 'Max Clients', key: 'maxclients', fallback: '10000' },
      { label: 'Rejected Connections', key: 'rejected_connections', fallback: '0' },
    ],
    accessibleDescription:
      'Stage 2: TCP Network Server binds port 6379 with non-blocking sockets and zero Nagle delay.',
  },
  {
    id: 'epoll',
    number: 3,
    title: 'Reactor Event Loop',
    subtitle: 'Linux epoll I/O Multiplexing',
    category: 'network',
    whatItDoes:
      'The single-threaded heart of Redis. Calls epoll_wait() to sleep with 0% CPU until the network card generates an electrical interrupt. Wakes up in O(1) time only for ready file descriptors.',
    whyItExists:
      'Eliminates thread context-switching overhead, race conditions, and locking. A single core can process over 100,000 requests per second because it never wastes time checking silent sockets.',
    exampleTitle: 'epoll Reactor Loop (src/net/event_loop.cpp)',
    exampleSnippet: `int n = epoll_wait(epoll_fd, events, MAX_EVENTS, timeout_ms);
for (int i = 0; i < n; i++) {
    int client_fd = events[i].data.fd;
    if (events[i].events & EPOLLIN) {
        handle_client_read(client_fd);
    }
}`,
    liveMetricFields: [
      { label: 'Instantaneous Ops/sec', key: 'instantaneous_ops_per_sec', fallback: '0' },
      { label: 'Process Uptime', key: 'uptime_in_seconds', formatter: (s) => `${s}s`, fallback: '420s' },
      { label: 'Total Commands Processed', key: 'total_commands_processed', fallback: '124' },
    ],
    accessibleDescription:
      'Stage 3: Reactor Event Loop multiplexes thousands of sockets using Linux epoll in O(1) time.',
  },
  {
    id: 'resp',
    number: 4,
    title: 'RESP Protocol Parser',
    subtitle: 'Streaming Wire Deserializer',
    category: 'protocol',
    whatItDoes:
      'Parses raw byte chunks from the socket buffer into high-level command vectors. Supports RESP2 (*, $, +, -, :) and RESP3 (%, ~, #, ,) types without memory allocation bottlenecks.',
    whyItExists:
      'Ensures strict binary safety. Bulk strings specify their exact length upfront ($5\\r\\n), allowing values to contain spaces, quotes, newlines, or binary images without escaping.',
    exampleTitle: 'RESP Streaming Parser (src/proto/resp_reader.cpp)',
    exampleSnippet: `// Parser recognizes leading byte:
// '*' -> Array of 3 elements
// '$' -> Bulk string of length 3 ("SET")
// '$' -> Bulk string of length 8 ("user:101")
// '$' -> Bulk string of length 5 ("Alice")
std::vector<std::string> args = {"SET", "user:101", "Alice"};`,
    liveMetricFields: [
      { label: 'Net Input Bytes', key: 'total_net_input_bytes', fallback: '45.2 KB' },
      { label: 'Net Output Bytes', key: 'total_net_output_bytes', fallback: '128.6 KB' },
    ],
    accessibleDescription:
      'Stage 4: RESP Protocol Parser decodes binary chunks into structured command arguments.',
  },
  {
    id: 'dispatcher',
    number: 5,
    title: 'Command Dispatcher',
    subtitle: 'Router, Arity & ACL Guard',
    category: 'dispatch',
    whatItDoes:
      'Looks up the command name in the global command hash table. Verifies argument counts (arity), checks ACL user permissions, and blocks write operations if maxmemory is exceeded.',
    whyItExists:
      'Guarantees system safety before any memory mutation. Rejects invalid syntax with immediate error responses (-ERR unknown command) before invoking storage layers.',
    exampleTitle: 'Command Table Lookup (src/commands/dispatcher.cpp)',
    exampleSnippet: `auto cmd = command_table.lookup("SET");
if (args.size() < 3) return reply_error("ERR wrong number of arguments");
if (!user.can_execute(cmd->flags)) return reply_error("NOPERM access denied");
if (cmd->is_write() && is_out_of_memory()) return reply_error("OOM command not allowed");`,
    liveMetricFields: [
      { label: 'Commands Registered', key: 'registered_commands', fallback: '68' },
      { label: 'Rejected Commands', key: 'rejected_commands', fallback: '0' },
    ],
    accessibleDescription:
      'Stage 5: Command Dispatcher validates arity, flags, and security before execution.',
  },
  {
    id: 'tx',
    number: 6,
    title: 'Transaction Manager',
    subtitle: 'MULTI / EXEC & WATCH Engine',
    category: 'dispatch',
    whatItDoes:
      'Controls atomic command batching. If the client called MULTI, commands are queued instead of executed. If keys monitored by WATCH were modified, the transaction is cleanly aborted.',
    whyItExists:
      'Provides ACID atomicity (all-or-nothing sequential execution) without expensive two-phase commits or heavyweight table locking.',
    exampleTitle: 'Transaction Queue (src/tx/transaction.cpp)',
    exampleSnippet: `if (client.is_in_multi() && cmd->name != "EXEC" && cmd->name != "DISCARD") {
    client.queue_command(cmd, args);
    return reply_status("+QUEUED\\r\\n");
}
// When EXEC is called:
if (client.watched_keys_dirty()) return reply_null_array();
return client.execute_queued_batch();`,
    liveMetricFields: [
      { label: 'Active Transactions', key: 'active_transactions', fallback: '0' },
      { label: 'Watched Keys', key: 'watched_keys', fallback: '0' },
    ],
    accessibleDescription:
      'Stage 6: Transaction Manager queues commands inside MULTI and enforces WATCH optimistic locking.',
  },
  {
    id: 'db',
    number: 7,
    title: 'Database Keyspace API',
    subtitle: 'Logical DB 0-15 & Key Lookup',
    category: 'storage',
    whatItDoes:
      'Directs commands to the active logical database (DB 0 to 15). Checks if the requested key exists, evaluates passive expiration deadlines, and tracks keyspace hit/miss ratios.',
    whyItExists:
      'Isolates tenants and environments. Provides transparent passive (lazy) TTL deletion: an expired key is deleted the exact millisecond it is read.',
    exampleTitle: 'Keyspace Lookup (src/db/keyspace.cpp)',
    exampleSnippet: `RedisDb& db = server.get_db(client.active_db_index); // e.g. DB 0
if (db.is_expired(key)) {
    db.delete_key(key); // Passive lazy expiry!
    return nullptr;
}
return db.lookup_key(key);`,
    liveMetricFields: [
      { label: 'Total Keys (DB 0)', key: 'db0_keys', fallback: '8' },
      { label: 'Keyspace Hits', key: 'keyspace_hits', fallback: '342' },
      { label: 'Keyspace Misses', key: 'keyspace_misses', fallback: '18' },
    ],
    accessibleDescription:
      'Stage 7: Database Keyspace isolates logical DBs and checks passive TTL expiration.',
  },
  {
    id: 'storage',
    number: 8,
    title: 'Storage Engine & Types',
    subtitle: 'Dict Rehashing & Compact Encodings',
    category: 'storage',
    whatItDoes:
      'Houses physical in-memory representations. Manages dict incremental rehashing across two tables, compact listpack/intset encodings, skiplists for Sorted Sets, and expires timers.',
    whyItExists:
      'Maximizes cache-line locality and memory efficiency. Small datasets use contiguous listpacks to save 80% RAM, automatically promoting to skiplists or quicklists as they grow.',
    exampleTitle: 'Incremental Rehash (src/db/dict.cpp)',
    exampleSnippet: `// Incremental rehashing: 1 bucket migrated per operation!
void Dict::rehash_step() {
    if (rehash_idx == -1) return;
    auto* entry = ht[0].buckets[rehash_idx];
    ht[1].insert(entry);
    rehash_idx++;
}`,
    liveMetricFields: [
      { label: 'Expired Keys', key: 'expired_keys', fallback: '14' },
      { label: 'Active Rehashes', key: 'rehash_in_progress', fallback: '0' },
      { label: 'Evicted Keys', key: 'evicted_keys', fallback: '0' },
    ],
    accessibleDescription:
      'Stage 8: Storage Engine handles incremental rehashing and compact memory encodings.',
  },
  {
    id: 'subsystems',
    number: 9,
    title: 'Subsystems & Durability',
    subtitle: 'Memory Allocator, Persistence & PSYNC',
    category: 'system',
    whatItDoes:
      'Tracks total allocated RAM via arena allocators, triggers LRU/LFU eviction when full, streams append-only logs (AOF), writes binary snapshot dumps (RDB), and feeds replica PSYNC offset backlogs.',
    whyItExists:
      'Guarantees disaster recovery, zero data loss, high availability failover, and hardware memory protection.',
    exampleTitle: 'Durability & Replication (src/obs/metrics.cpp)',
    exampleSnippet: `// PSYNC replication stream
server.repl_backlog.append(raw_resp_command);
server.master_repl_offset += command_byte_length;
// AOF fsync
if (server.aof_enabled) {
    write(server.aof_fd, raw_resp_command.data(), raw_resp_command.size());
}`,
    liveMetricFields: [
      { label: 'Used Memory', key: 'used_memory_human', fallback: '1.24 MB' },
      { label: 'Memory Frag Ratio', key: 'mem_fragmentation_ratio', fallback: '1.08' },
      { label: 'AOF Enabled', key: 'aof_enabled', fallback: 'no' },
      { label: 'Replication Offset', key: 'master_repl_offset', fallback: '4082' },
    ],
    accessibleDescription:
      'Stage 9: Subsystems manages arena memory, AOF/RDB persistence, and PSYNC replication.',
  },
];

export const SET_REQUEST_TRACE: RequestAnimationStep[] = [
  {
    stageId: 'client',
    stepNumber: 1,
    title: 'Client Encodes SET a 1',
    narration:
      'The client encodes the command SET a 1 into RESP2 wire format: *3\\r\\n$3\\r\\nSET\\r\\n$1\\r\\na\\r\\n$1\\r\\n1\\r\\n (33 bytes) and writes to socket.',
    wireBytes: '*3\\r\\n$3\\r\\nSET\\r\\n$1\\r\\na\\r\\n$1\\r\\n1\\r\\n',
    dataState: 'Command: SET | Key: "a" | Value: "1"',
  },
  {
    stageId: 'tcp',
    stepNumber: 2,
    title: 'TCP Socket Receives Packet',
    narration:
      'Linux kernel TCP stack receives electrical packet on port 6379, acknowledges TCP ACK, and buffers raw bytes into the client socket sk_buff.',
    wireBytes: 'TCP SYN-ACK -> Established -> sk_buff (33 bytes)',
  },
  {
    stageId: 'epoll',
    stepNumber: 3,
    title: 'epoll_wait() Wakes Up Event Loop',
    narration:
      'Network card generates an interrupt. Linux kernel marks client socket FD ready. epoll_wait() wakes up the single-threaded reactor in 0.5 microseconds!',
    wireBytes: 'EPOLLIN event on client socket FD 12',
  },
  {
    stageId: 'resp',
    stepNumber: 4,
    title: 'RESP Parser Deserializes Array',
    narration:
      'The parser scans the buffer, identifies array prefix (*3), extracts strings "SET", "a", and "1" without unnecessary allocations.',
    wireBytes: 'Tokens: ["SET", "a", "1"]',
  },
  {
    stageId: 'dispatcher',
    stepNumber: 5,
    title: 'Command Dispatcher Validates Arity & Flags',
    narration:
      'Dispatcher looks up "SET", confirms arity >= 3, validates write permissions, and checks that server memory is below maxmemory limit.',
    dataState: 'Command: SET (flags: write, denyoom) -> ALLOWED',
  },
  {
    stageId: 'tx',
    stepNumber: 6,
    title: 'Transaction Manager Check',
    narration:
      'Client is not inside a MULTI block. The command skips transaction queuing and proceeds immediately to execution.',
    dataState: 'Client Multi State: IDLE (immediate execution)',
  },
  {
    stageId: 'db',
    stepNumber: 7,
    title: 'Select Database 0 Keyspace',
    narration:
      'Directs the operation to DB 0. Evaluates if key "a" already exists or has an active TTL deadline.',
    dataState: 'Active DB: 0 | Key: "a"',
  },
  {
    stageId: 'storage',
    stepNumber: 8,
    title: 'Hash Table Storage & SDS Mutation',
    narration:
      'Storage engine creates a dictEntry with key "a" and value SDS string "1". Inserts into ht[0] in O(1) time.',
    dataState: 'DB 0 dictEntry inserted: "a" -> "1"',
  },
  {
    stageId: 'subsystems',
    stepNumber: 9,
    title: 'Replication Offset & Return +OK',
    narration:
      'Appends command to replication backlog (+33 bytes offset), logs to AOF if enabled, and writes wire response "+OK\\r\\n" back to client.',
    wireBytes: '+OK\\r\\n',
    dataState: 'Offset: +33B | Reply: OK',
  },
];

export const GET_REQUEST_TRACE: RequestAnimationStep[] = [
  {
    stageId: 'client',
    stepNumber: 1,
    title: 'Client Encodes GET a',
    narration:
      'The client formats GET a into RESP format: *2\\r\\n$3\\r\\nGET\\r\\n$1\\r\\na\\r\\n (18 bytes) and pushes down the TCP stream.',
    wireBytes: '*2\\r\\n$3\\r\\nGET\\r\\n$1\\r\\na\\r\\n',
    dataState: 'Command: GET | Key: "a"',
  },
  {
    stageId: 'tcp',
    stepNumber: 2,
    title: 'TCP Non-Blocking Ingestion',
    narration:
      'Packet arrives at non-blocking socket. Kernel places bytes into connection input buffer.',
    wireBytes: 'Input buffer: 18 bytes received',
  },
  {
    stageId: 'epoll',
    stepNumber: 3,
    title: 'Reactor Event Loop Dispatches Read',
    narration:
      'epoll_wait() returns socket FD with read flag. Event loop calls read_from_client() callback.',
    wireBytes: 'Reactor: Event read triggered',
  },
  {
    stageId: 'resp',
    stepNumber: 4,
    title: 'RESP Parser Extracts Key',
    narration:
      'Parser decodes the array into ["GET", "a"]. Zero memory allocations needed for small inline buffer.',
    wireBytes: 'Tokens: ["GET", "a"]',
  },
  {
    stageId: 'dispatcher',
    stepNumber: 5,
    title: 'Dispatcher Verifies Read-Only Flags',
    narration:
      'Command table flags indicate GET is readonly and fast. No maxmemory or write-safety checks needed.',
    dataState: 'Command: GET (flags: readonly, fast) -> ALLOWED',
  },
  {
    stageId: 'tx',
    stepNumber: 6,
    title: 'Transaction Check',
    narration:
      'Client is executing normally. Command bypasses transaction queue.',
    dataState: 'Direct execution pass-through',
  },
  {
    stageId: 'db',
    stepNumber: 7,
    title: 'Keyspace Lookup & Passive Expiry Check',
    narration:
      'Finds key "a" in DB 0. Checks TTL timestamp: persistent, not expired. Keyspace hit counter increments!',
    dataState: 'Keyspace Hit: "a" found in ht[0]',
  },
  {
    stageId: 'storage',
    stepNumber: 8,
    title: 'Value Retrieval from Memory',
    narration:
      'Reads pointer to SDS string "1". Storage engine prepares bulk string response of length 1.',
    dataState: 'Value: "1" (length: 1 byte)',
  },
  {
    stageId: 'subsystems',
    stepNumber: 9,
    title: 'Returns Bulk String $1\\r\\n1\\r\\n',
    narration:
      'Because GET is read-only, replication and AOF are skipped! Response $1\\r\\n1\\r\\n is streamed directly to client in sub-microsecond time.',
    wireBytes: '$1\\r\\n1\\r\\n',
    dataState: 'Reply: "1"',
  },
];
