# Contributing to RedisX (`pbRedisDB`)

Thank you for contributing to RedisX! This guide explains how to set up the development environment, use CMake presets, run all testing tiers, and format code.

---

##  Prerequisites

To build, test, and profile RedisX, ensure the following dependencies are installed:

* **Operating System:** Linux (Ubuntu 22.04 LTS recommended) or Windows with **WSL2**.
* **Compiler:** `g++-12` (or newer) or `clang++-15` (or newer) with full **C++20** support.
* **Build System:** `cmake` (>= 3.20) and `ninja-build`.
* **Python:** Python 3.8+ (for real-client compatibility suites).
* **Optional Tools:** `jemalloc-dev`, `perf`, `valgrind`, `redis-tools` (`redis-cli`, `redis-benchmark`).

On Ubuntu / Debian:
```bash
sudo apt update && sudo apt install -y \
    cmake ninja-build g++-12 make git \
    libjemalloc-dev redis-tools python3 python3-pip
```

---

##  CMake Build Presets

RedisX uses standard CMake presets defined in `CMakePresets.json`.

| Preset Name | Build Type | Flags / Sanitizers | Purpose |
| :--- | :--- | :--- | :--- |
| **`debug`** | Debug (`-O0 -g`) | Warnings (`-Wall -Wextra -Werror`) | Day-to-day development, assertions enabled |
| **`asan`** | Debug (`-O0 -g`) | AddressSanitizer + UBSan (`-fsanitize=address,undefined`) | Detect memory leaks, buffer overflows, undefined behavior |
| **`tsan`** | Debug (`-O0 -g`) | ThreadSanitizer (`-fsanitize=thread`) | Detect multi-threaded data races in background I/O threads |
| **`release`** | Release (`-O3`) | Optimizations, asserts stripped (`-DNDEBUG`) | High-throughput benchmarking & production binaries |

### Configuring & Building with Presets

```bash
# 1. Configure the build directory
cmake --preset debug

# 2. Compile the server executable and test binaries
cmake --build --preset debug

# Or compile for Release:
cmake --preset release
cmake --build --preset release
```

---

##  Running Test Tiers

RedisX implements a 6-tier verification strategy to guarantee protocol fidelity, memory safety, and crash durability.

### Tier 1: Unit Tests
Tests low-level primitives: `Buffer`, `RespReader`, `RespWriter`, dynamic `Dict`, `SkipList`, `QuickList`, `Intset`, `Listpack`, and `TTLManager`.
```bash
# Via ctest:
ctest --preset debug -R unit_tests --output-on-failure

# Or run the binary directly:
./build/debug/tests/unit_tests
```

### Tier 2: Integration Tests
Tests full network server interaction: client connections, multi-type commands, PSYNC replication, transactions (`WATCH`/`MULTI`/`EXEC`), Pub/Sub, ACL, and slowlog.
```bash
ctest --preset debug -R integration_tests --output-on-failure
```

### Tier 3: Differential Property-Based Invariant Tests
Dispatches randomized command sequences simultaneously against RedisX and an in-memory C++ reference model constructed with standard library containers, shrinking any failing sequences.
```bash
./build/debug/tests/integration_tests --gtest_filter="PropertyTest.*"
```

### Tier 4: Chaos & Fault Injection Tests
Validates system resilience by injecting simulated disk write failures, `fsync` errors, network drops, and snapshot corruption.
```bash
./build/debug/tests/integration_tests --gtest_filter="ChaosTest.*"
```

### Tier 5: Whole-Path Fuzzing (ASan + UBSan)
Fuzzes the byte-level RESP parser and command dispatcher using LLVM libFuzzer.
```bash
# Configure with fuzzers enabled
cmake -B build/fuzz -S . -G Ninja \
    -DCMAKE_BUILD_TYPE=Debug \
    -DREDISX_BUILD_FUZZERS=ON \
    -DCMAKE_CXX_COMPILER=clang++-15

cmake --build build/fuzz --target resp_fuzz
./build/fuzz/tests/resp_fuzz -max_total_time=60
```

### Tier 6: Real-Client Compatibility Tests
Validates protocol compatibility against native Python Redis drivers:
```bash
# Start server in background
./build/debug/redisx &
SERVER_PID=$!

# Run python client verification
python3 tests/compat/run_real_clients.py

# Cleanup server
kill -9 $SERVER_PID
```

---

## Benchmarking & Profiling

### Running the Custom Load Generator
RedisX includes a high-throughput load generator (`tools/loadgen.cpp`):
```bash
cmake --build --preset release --target loadgen
./build/release/tools/loadgen -h 127.0.0.1 -p 6379 -c 50 -n 100000
```

### Standard `redis-benchmark`
```bash
# Pipeline GET throughput
redis-benchmark -h 127.0.0.1 -p 6379 -t get -P 64 -q

# Mixed write workload
redis-benchmark -h 127.0.0.1 -p 6379 -t set,lpush,sadd,hset -c 100 -n 100000 -q
```

---

##  Code Style & Quality

* **Formatting:** All C++ code must adhere to `.clang-format`. Format your code before committing:
  ```bash
  clang-format -i src/**/*.cpp include/**/*.h tests/**/*.cpp
  ```
* **Static Analysis:** RedisX enforces `.clang-tidy` checks in CI:
  ```bash
  clang-tidy src/**/*.cpp -p build/debug
  ```
* **Git Commit Conventions:** Follow Conventional Commits:
  - `feat(...)`: New feature or command
  - `fix(...)`: Bug fix or protocol correction
  - `perf(...)`: Performance optimization or benchmark addition
  - `test(...)`: Test addition or property harness update
  - `docs(...)`: Documentation enhancement
