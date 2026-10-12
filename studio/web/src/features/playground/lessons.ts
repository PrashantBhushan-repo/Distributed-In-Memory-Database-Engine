import { PlaygroundDataType, PlaygroundLesson } from './types';

export const LESSONS_BY_TYPE: Record<PlaygroundDataType, PlaygroundLesson[]> = {
  string: [
    {
      id: 'str_1',
      title: 'Short String (embstr)',
      command: 'SET play:str "hello"',
      teaches: 'Strings ≤ 44B use embstr: redisObject and SDS struct are allocated in a single contiguous jemalloc chunk.',
    },
    {
      id: 'str_2',
      title: 'In-Place Buffer Append',
      command: 'APPEND play:str " world!"',
      teaches: 'APPEND expands the SDS buffer. Redis reuses spare allocation capacity (sdsAlloc) without reallocating.',
    },
    {
      id: 'str_3',
      title: 'Native Integer Optimization',
      command: 'SET play:num "42"',
      teaches: 'Numeric strings are parsed into signed long integers and stored directly inside the robj pointer field (0 overhead).',
    },
    {
      id: 'str_4',
      title: 'Atomic Integer Increment',
      command: 'INCR play:num',
      teaches: 'INCR performs atomic math directly on the integer encoding without string serialization.',
    },
    {
      id: 'str_5',
      title: 'Exceed 44-Byte Threshold (raw)',
      command: 'SET play:str "This is an elongated string that deliberately exceeds the forty-four byte threshold"',
      teaches: 'Crossing 44 bytes transitions the encoding from embstr to raw (separate heap allocation for SDS).',
    },
    {
      id: 'str_6',
      title: 'O(1) String Length',
      command: 'STRLEN play:str',
      teaches: 'STRLEN reads the pre-computed `len` field directly from the SDS header in O(1) time without scanning bytes.',
    },
    {
      id: 'str_7',
      title: 'Zero-Copy Slice',
      command: 'GETRANGE play:str 0 10',
      teaches: 'GETRANGE reads an exact byte slice directly from the internal SDS buffer.',
    },
  ],

  list: [
    {
      id: 'list_1',
      title: 'Compact Listpack Prepend',
      command: 'LPUSH play:tasks "urgent: fix bug"',
      teaches: 'Small lists use listpack: consecutive elements stored compactly in a single contiguous memory block.',
    },
    {
      id: 'list_2',
      title: 'Push Multiple Elements',
      command: 'RPUSH play:tasks "run migrations" "send digest"',
      teaches: 'RPUSH appends to the tail of the listpack with minimal memory fragmentation.',
    },
    {
      id: 'list_3',
      title: 'Fast Head Pop',
      command: 'LPOP play:tasks',
      teaches: 'LPOP shifts the listpack head pointer, returning the item in O(1) time.',
    },
    {
      id: 'list_4',
      title: 'Slice Range (LRANGE)',
      command: 'LRANGE play:tasks 0 -1',
      teaches: 'LRANGE traverses contiguous listpack entries with high CPU cache locality.',
    },
    {
      id: 'list_5',
      title: 'Trigger Quicklist Transition',
      command: 'RPUSH play:tasks "this_is_an_exceptionally_large_payload_string_that_exceeds_sixty_four_bytes_to_trigger_quicklist_conversion"',
      teaches: 'Inserting any element > 64B flips encoding from listpack to quicklist (doubly linked list of listpacks).',
    },
    {
      id: 'list_6',
      title: 'Inspect Element by Index',
      command: 'LINDEX play:tasks 0',
      teaches: 'LINDEX seeks elements using quicklist node offset counting.',
    },
  ],

  hash: [
    {
      id: 'hash_1',
      title: 'Set Multiple Fields',
      command: 'HSET play:user:101 status "active" department "Engineering"',
      teaches: 'Small hashes store field-value pairs in a single listpack without dictionary bucket overhead.',
    },
    {
      id: 'hash_2',
      title: 'Atomic Field Increment',
      command: 'HINCRBY play:user:101 logins 1',
      teaches: 'HINCRBY parses the numeric value from the listpack entry and updates it in place.',
    },
    {
      id: 'hash_3',
      title: 'Retrieve Single Field',
      command: 'HGET play:user:101 name',
      teaches: 'HGET does a linear scan over the listpack pairs. Fast because small listpacks fit in L1 CPU cache.',
    },
    {
      id: 'hash_4',
      title: 'Trigger Hash Table Conversion',
      command: 'HSET play:user:101 bio "A very detailed biographical summary that intentionally exceeds sixty-four bytes in total size to force a dictionary transition"',
      teaches: 'Values > 64B convert the hash into a hashtable (dict) with hash buckets for O(1) lookups.',
    },
    {
      id: 'hash_5',
      title: 'Retrieve All Key-Value Pairs',
      command: 'HGETALL play:user:101',
      teaches: 'HGETALL exports all fields and values in alternating sequential order.',
    },
    {
      id: 'hash_6',
      title: 'Delete Hash Field',
      command: 'HDEL play:user:101 language',
      teaches: 'HDEL removes the entry from the dict bucket without rehashing the entire table.',
    },
  ],

  set: [
    {
      id: 'set_1',
      title: 'Integer Set (16-bit Intset)',
      command: 'SADD play:ports 22 53 80',
      teaches: 'Sets with only small integers use intset (sorted array of 16-bit integers, INTSET_ENC_INT16).',
    },
    {
      id: 'set_2',
      title: 'Widen Intset to 32-bit',
      command: 'SADD play:ports 70000',
      teaches: 'Adding an integer > 32767 widens the entire intset array from 16-bit to 32-bit elements in place!',
    },
    {
      id: 'set_3',
      title: 'Widen Intset to 64-bit',
      command: 'SADD play:ports 3000000000',
      teaches: 'Adding an integer > 2^31 widens all elements to 64-bit (INTSET_ENC_INT64).',
    },
    {
      id: 'set_4',
      title: 'Trigger Hashtable Conversion',
      command: 'SADD play:ports "ssh_port"',
      teaches: 'Adding a non-integer string immediately converts the set from intset to a hash table (dict)!',
    },
    {
      id: 'set_5',
      title: 'Fast Membership Test',
      command: 'SISMEMBER play:ports 80',
      teaches: 'SISMEMBER runs in O(log N) for intset via binary search, or O(1) for hashtable.',
    },
    {
      id: 'set_6',
      title: 'Set Cardinality',
      command: 'SCARD play:ports',
      teaches: 'SCARD reads the total member count stored directly in the header.',
    },
  ],

  zset: [
    {
      id: 'zset_1',
      title: 'Add Sorted Members',
      command: 'ZADD play:leaderboard 420 "dave" 600 "eve"',
      teaches: 'Small sorted sets use a listpack with elements sorted by score in ascending order.',
    },
    {
      id: 'zset_2',
      title: 'Range Query with Scores',
      command: 'ZRANGE play:leaderboard 0 -1 WITHSCORES',
      teaches: 'ZRANGE iterates the sorted elements in O(log N + M) time.',
    },
    {
      id: 'zset_3',
      title: 'Score Rank Query',
      command: 'ZRANK play:leaderboard "alice"',
      teaches: 'ZRANK returns the 0-based position of the member in the sorted order.',
    },
    {
      id: 'zset_4',
      title: 'Trigger Skiplist Conversion',
      command: 'ZADD play:leaderboard 999 "super_extraordinarily_long_player_handle_name_exceeding_the_sixty_four_byte_limit"',
      teaches: 'Members > 64B or count > 128 convert the zset to a Skiplist with multi-level towers + hash table.',
    },
    {
      id: 'zset_5',
      title: 'Update Member Score',
      command: 'ZADD play:leaderboard 750 "alice"',
      teaches: 'Updating an existing member relocates the node to maintain strict score order in the skiplist.',
    },
  ],

  none: [],
};

export const THRESHOLD_PUSH_SCRIPTS: Record<
  PlaygroundDataType,
  {
    title: string;
    narrative: string[];
    commands: string[];
  }
> = {
  string: {
    title: 'Push String Past 44-Byte embstr Threshold',
    narrative: [
      'Step 1: SET short string (length ≤ 44B) → Encoding is embstr (contiguous jemalloc block).',
      'Step 2: APPEND extra characters to exceed 44 bytes → Encoding flips to raw SDS allocation!',
    ],
    commands: [
      'SET play:str "Initial short text"',
      'APPEND play:str " ... now appending extra characters to exceed 44 bytes total length!"',
    ],
  },
  list: {
    title: 'Push List from listpack to quicklist',
    narrative: [
      'Step 1: LPUSH standard items into listpack.',
      'Step 2: RPUSH an element > 64 bytes → Encoding flips immediately to quicklist (linked list of listpacks)!',
    ],
    commands: [
      'RPUSH play:tasks "item_a" "item_b"',
      'RPUSH play:tasks "A_very_long_list_item_string_that_exceeds_the_sixty_four_byte_threshold_for_compact_listpack_storage"',
    ],
  },
  hash: {
    title: 'Push Hash from listpack to hashtable',
    narrative: [
      'Step 1: HSET standard field/value pairs in listpack.',
      'Step 2: HSET a value > 64 bytes → Encoding transitions from listpack to a full hash table (dict) with buckets!',
    ],
    commands: [
      'HSET play:user:101 title "Developer"',
      'HSET play:user:101 profile "A comprehensive overview of user capabilities that intentionally surpasses sixty-four bytes in total length"',
    ],
  },
  set: {
    title: 'Demonstrate Intset Widening (16→32→64) then Hashtable',
    narrative: [
      'Step 1: SADD 16-bit integer (≤ 32767) → INTSET_ENC_INT16.',
      'Step 2: SADD 32-bit integer (> 32767) → Intset widens to 32 bits!',
      'Step 3: SADD 64-bit integer (> 2^31) → Intset widens to 64 bits!',
      'Step 4: SADD a string → Instantly flips to hashtable (dict)!',
    ],
    commands: [
      'SADD play:ports 100',
      'SADD play:ports 65536',
      'SADD play:ports 5000000000',
      'SADD play:ports "named_service"',
    ],
  },
  zset: {
    title: 'Push Sorted Set from listpack to skiplist',
    narrative: [
      'Step 1: ZADD items in listpack.',
      'Step 2: ZADD member > 64 bytes → Flips to Skiplist multi-level pointer towers!',
    ],
    commands: [
      'ZADD play:leaderboard 50 "charlie" 150 "alice"',
      'ZADD play:leaderboard 999 "An_exceptionally_long_member_key_name_that_exceeds_sixty_four_bytes_to_force_skiplist_tower_generation"',
    ],
  },
  none: {
    title: '',
    narrative: [],
    commands: [],
  },
};
