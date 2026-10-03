#!/usr/bin/env bash
set -e

PORT=6398
echo "=================================================="
echo "   RedisX Stage 5 Data Structures Verification   "
echo "=================================================="

./build/redisx -p $PORT > /dev/null 2>&1 &
SERVER_PID=$!
sleep 1

cleanup() {
    kill -9 $SERVER_PID 2>/dev/null || true
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

echo "--- 1. Testing HASH Commands (HSET, HGET, HDEL, HLEN) ---"
H1=$(redis-cli -p $PORT HSET user:100 name "Prashant" email "p@ex.com")
assert_eq "HSET added 2 fields" "$H1" "2"

H2=$(redis-cli -p $PORT HGET user:100 name)
assert_eq "HGET user:100 name" "$H2" "Prashant"

H3=$(redis-cli -p $PORT HLEN user:100)
assert_eq "HLEN user:100" "$H3" "2"

H4=$(redis-cli -p $PORT HDEL user:100 email)
assert_eq "HDEL user:100 email" "$H4" "1"

echo "--- 2. Testing LIST Commands (LPUSH, RPUSH, LPOP, RPOP, LLEN) ---"
L1=$(redis-cli -p $PORT LPUSH tasks "task2" "task1")
assert_eq "LPUSH tasks 2 elements" "$L1" "2"

L2=$(redis-cli -p $PORT RPUSH tasks "task3")
assert_eq "RPUSH tasks 1 element" "$L2" "3"

L3=$(redis-cli -p $PORT LPOP tasks)
assert_eq "LPOP tasks" "$L3" "task1"

L4=$(redis-cli -p $PORT LLEN tasks)
assert_eq "LLEN tasks" "$L4" "2"

echo "--- 3. Testing SET Commands (SADD, SISMEMBER, SCARD, SREM) ---"
S1=$(redis-cli -p $PORT SADD colors "red" "green" "blue" "red")
assert_eq "SADD colors (ignores dupes)" "$S1" "3"

S2=$(redis-cli -p $PORT SISMEMBER colors "green")
assert_eq "SISMEMBER colors green" "$S2" "1"

S3=$(redis-cli -p $PORT SCARD colors)
assert_eq "SCARD colors" "$S3" "3"

echo "--- 4. Testing ZSET Commands (ZADD, ZSCORE, ZRANK, ZCARD) ---"
Z1=$(redis-cli -p $PORT ZADD leaderboard 95.0 "Prashant" 88.0 "Mohan" 75.0 "Rahul")
assert_eq "ZADD leaderboard 3 members" "$Z1" "3"

Z2=$(redis-cli -p $PORT ZSCORE leaderboard "Prashant")
assert_eq "ZSCORE leaderboard Prashant" "$Z2" "95"

Z3=$(redis-cli -p $PORT ZCARD leaderboard)
assert_eq "ZCARD leaderboard" "$Z3" "3"

echo "--- 5. Testing WRONGTYPE Error Protection ---"
ERR=$(redis-cli -p $PORT LPUSH user:100 "invalid" 2>&1 || true)
if [[ "$ERR" == *"WRONGTYPE"* ]]; then
    assert_eq "WRONGTYPE Error on mismatched data type" "WRONGTYPE" "WRONGTYPE"
else
    assert_eq "WRONGTYPE Error on mismatched data type" "$ERR" "WRONGTYPE"
fi

echo "=================================================="
echo " Summary: Passed $pass_count / $((pass_count+fail_count)) checks"
echo "=================================================="
