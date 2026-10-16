#!/usr/bin/env bash
set -e

PORT=6399
echo "=================================================="
echo "   RedisX Stage 4 Single-Shot Verification Test  "
echo "=================================================="

./build/redisx -p $PORT > /dev/null 2>&1 &
SERVER_PID=$!
sleep 1

cleanup() {
    kill -9 $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Color output helpers
GREEN='\030[1;32m'
RED='\030[1;31m'
NC='\030[0m'

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

# 1. SET EX & TTL
redis-cli -p $PORT SET key_ex "hello" EX 10 > /dev/null
TTL1=$(redis-cli -p $PORT TTL key_ex)
assert_eq "SET key EX 10 -> TTL" "$TTL1" "10"

# 2. SET KEEPTTL
redis-cli -p $PORT SET key_ex "world" KEEPTTL > /dev/null
TTL2=$(redis-cli -p $PORT TTL key_ex)
assert_eq "SET KEEPTTL preserves expiration" "$TTL2" "10"

# 3. EXPIRE Options (NX, XX, GT, LT)
redis-cli -p $PORT SET key_opt "val" > /dev/null
R_XX=$(redis-cli -p $PORT EXPIRE key_opt 10 XX)
assert_eq "EXPIRE XX on persistent key fails" "$R_XX" "0"

R_NX=$(redis-cli -p $PORT EXPIRE key_opt 10 NX)
assert_eq "EXPIRE NX on persistent key succeeds" "$R_NX" "1"

R_GT1=$(redis-cli -p $PORT EXPIRE key_opt 5 GT)
assert_eq "EXPIRE 5s GT (when current is 10s) fails" "$R_GT1" "0"

R_GT2=$(redis-cli -p $PORT EXPIRE key_opt 20 GT)
assert_eq "EXPIRE 20s GT (when current is 10s) succeeds" "$R_GT2" "1"

R_LT=$(redis-cli -p $PORT EXPIRE key_opt 5 LT)
assert_eq "EXPIRE 5s LT (when current is 20s) succeeds" "$R_LT" "1"

# 4. PERSIST
R_PER=$(redis-cli -p $PORT PERSIST key_opt)
TTL3=$(redis-cli -p $PORT TTL key_opt)
assert_eq "PERSIST removes expiration" "$R_PER" "1"
assert_eq "TTL after PERSIST returns -1" "$TTL3" "-1"

# 5. Lazy Expiration
redis-cli -p $PORT SET key_lazy "temp" EX 1 > /dev/null
sleep 1.2
GET_LAZY=$(redis-cli -p $PORT GET key_lazy)
TTL_LAZY=$(redis-cli -p $PORT TTL key_lazy)
assert_eq "GET on expired key returns nil" "$GET_LAZY" ""
assert_eq "TTL on expired key returns -2" "$TTL_LAZY" "-2"

# 6. Active Expiration (Background Cleanup)
redis-cli -p $PORT SET bg1 1 EX 1 > /dev/null
redis-cli -p $PORT SET bg2 2 EX 1 > /dev/null
redis-cli -p $PORT SET bg3 3 EX 1 > /dev/null
sleep 2.5
# Trigger active expire cycle tick or check lazy expire
E1=$(redis-cli -p $PORT EXISTS bg1)
E2=$(redis-cli -p $PORT EXISTS bg2)
E3=$(redis-cli -p $PORT EXISTS bg3)
assert_eq "Background expired bg1 non-existent" "$E1" "0"
assert_eq "Background expired bg2 non-existent" "$E2" "0"
assert_eq "Background expired bg3 non-existent" "$E3" "0"

echo "=================================================="
echo " Summary: Passed $pass_count / $((pass_count+fail_count)) checks"
echo "=================================================="
