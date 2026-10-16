#!/usr/bin/env bash
set -e

MASTER_PORT=6379
REPLICA_PORT=6380

echo "=================================================="
echo "   RedisX Stage 8 Replication Verification Test  "
echo "=================================================="

# 1. Start Master & Replica servers
./build-wsl/redisx -p $MASTER_PORT > /dev/null 2>&1 &
MASTER_PID=$!

./build-wsl/redisx -p $REPLICA_PORT > /dev/null 2>&1 &
REPLICA_PID=$!

sleep 1

cleanup() {
    kill -9 $MASTER_PID $REPLICA_PID 2>/dev/null || true
}
trap cleanup EXIT

pass_count=0
fail_count=0

assert_eq() {
    local label="$1"
    local actual="$2"
    local expected="$3"
    if [ "$actual" = "$expected" ]; then
        echo -e "[PASS] $label (Got: $actual)"
        pass_count=$((pass_count+1))
    else
        echo -e "[FAIL] $label (Expected: $expected, Got: $actual)"
        fail_count=$((fail_count+1))
    fi
}

echo "--- 1. Testing Initial Role Verification ---"
ROLE_M=$(redis-cli -p $MASTER_PORT ROLE | head -n 1)
ROLE_R=$(redis-cli -p $REPLICA_PORT ROLE | head -n 1)
assert_eq "Master initial role" "$ROLE_M" "master"
assert_eq "Replica initial role" "$ROLE_R" "master"

echo "--- 2. Linking Replica to Master (REPLICAOF 127.0.0.1 6379) ---"
redis-cli -p $REPLICA_PORT REPLICAOF 127.0.0.1 $MASTER_PORT > /dev/null
sleep 1.5

ROLE_R2=$(redis-cli -p $REPLICA_PORT ROLE | head -n 1)
assert_eq "Replica role after REPLICAOF" "$ROLE_R2" "slave"

CON_REPLS=$(redis-cli -p $MASTER_PORT INFO replication | grep "connected_slaves" | cut -d: -f2 | tr -d '\r')
assert_eq "Master connected replicas count" "$CON_REPLS" "1"

echo "--- 3. Testing Real-Time Write Command Streaming ---"
redis-cli -p $MASTER_PORT SET repl_key "HelloReplication" > /dev/null
sleep 0.5

VAL_R=$(redis-cli -p $REPLICA_PORT GET repl_key)
assert_eq "Replica received streamed SET value" "$VAL_R" "HelloReplication"

echo "--- 4. Testing Replica Read-Only Protection ---"
ERR_WRITE=$(redis-cli -p $REPLICA_PORT SET err_key "val" 2>&1 || true)
if [[ "$ERR_WRITE" == *"READONLY"* ]]; then
    assert_eq "Replica blocks write command" "READONLY" "READONLY"
else
    assert_eq "Replica blocks write command" "$ERR_WRITE" "READONLY"
fi

echo "--- 5. Testing Manual Failover Promotion (REPLICAOF NO ONE) ---"
redis-cli -p $REPLICA_PORT REPLICAOF NO ONE > /dev/null
sleep 0.5

ROLE_PROMOTED=$(redis-cli -p $REPLICA_PORT ROLE | head -n 1)
assert_eq "Promoted Replica new role" "$ROLE_PROMOTED" "master"

# Promoted Master can now accept write commands!
redis-cli -p $REPLICA_PORT SET promoted_key "NowMaster" > /dev/null
VAL_PROMOTED=$(redis-cli -p $REPLICA_PORT GET promoted_key)
assert_eq "Promoted Master accepts writes" "$VAL_PROMOTED" "NowMaster"

echo "=================================================="
echo " Summary: Passed $pass_count / $((pass_count+fail_count)) checks"
echo "=================================================="
