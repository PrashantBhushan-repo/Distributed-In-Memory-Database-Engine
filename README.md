# RedisX (`pbRedisDB`) & RedisX Studio

> A high-performance, low-latency, event-driven in-memory key-value database engine built from scratch in modern **C++20** featuring a single-threaded `epoll` reactor event loop, full RESP2/RESP3 protocol compliance, master-replica PSYNC replication, dual AOF+RDB persistence, native OpenMetrics telemetry, and **RedisX Studio** — an industrial administrative visualizer, real-time telemetry console, and interactive educational playground.

[![Build & Test](https://github.com/PrashantBhushan-repo/Distributed-In-Memory-Database-Engine/actions/workflows/cmake-ci.yml/badge.svg)](https://github.com/PrashantBhushan-repo/Distributed-In-Memory-Database-Engine/actions)
[![Language](https://img.shields.io/badge/Language-C%2B%2B20-blue.svg)](https://en.cppreference.com/w/cpp/20)
[![Studio](https://img.shields.io/badge/Studio-React%2018%20%2B%20Fastify-emerald.svg)](https://react.dev/)
[![Protocol](https://img.shields.io/badge/Protocol-RESP2%2FRESP3-red.svg)](https://redis.io/docs/latest/develop/reference/protocol-spec/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ⚡ 1-Command Quickstart

### Option 1: Docker Compose (Full Stack in One Command)
Run the entire production stack (RedisX Engine + Fastify Gateway + React Studio) with automatic container healthchecks:
```bash
docker compose up -d
```
* **RedisX Studio Web UI**: [http://localhost:3000](http://localhost:3000)
* **API Gateway & Health**: [http://localhost:4000/health](http://localhost:4000/health)
* **C++ Redis Engine**: `localhost:6379` (RESP2/RESP3)

### Option 2: Local Developer Mode (Instant Demo Mode — Zero Setup)
Run RedisX Studio in pure browser & gateway simulation mode without needing an active C++ Redis daemon:
```bash
# Terminal 1: Fastify API Gateway
npm run backend

# Terminal 2: React 18 Studio Frontend
npm run frontend
```
Navigate to **[http://localhost:3000](http://localhost:3000)**. The gateway will automatically fall back to the built-in mock demo engine with pre-seeded datasets, live telemetry, and simulated memory pressure.

### Option 3: Native C++ Engine (Linux / WSL2)
```bash
# Build stripped release binary
cmake -B build-wsl -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build-wsl --target redisx --parallel $(nproc)

# Launch RedisX Reactor on port 6379
./build-wsl/redisx -h 127.0.0.1 -p 6379 -c infra/configs/pbRedis.conf
```

---

## 🏛️ System Architecture

```text
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                                REDISX STUDIO                                   │
 │                          React 18 + Vite Web App                               │
 │                           (Port 3000 · <87 KB)                                 │
 └───────────────────────────────────┬────────────────────────────────────────────┘
                                     │ HTTP REST + WebSockets
                                     v
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                             FASTIFY API GATEWAY                                │
 │                 Zod Validation · AST Safety Engine · JWT Auth                  │
 │                               (Port 4000)                                      │
 └───────────────────────────────────┬────────────────────────────────────────────┘
                                     │ Vectorized Commands (No Shell Concatenation)
                                     v
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                           REDISX C++20 ENGINE                                  │
 │                      Single-Threaded Epoll Reactor                             │
 │                               (Port 6379)                                      │
 └──────┬────────────────────────────┬─────────────────────────────┬──────────────┘
        │                            │                             │
        v                            v                             v
 ┌───────────────┐           ┌───────────────┐             ┌───────────────┐
 │ Keyspace Dict │           │  Dual Engine  │             │ PSYNC Primary │
 │  & TTL Timer  │           │   AOF + RDB   │             │   Replica     │
 └───────────────┘           └───────────────┘             └───────────────┘
```

---

## 📸 Screenshots & Visual Tour

| Feature | Screenshot / Preview | Description |
| :--- | :--- | :--- |
| **Interactive Dashboard** | ![Dashboard](docs/screenshots/dashboard.png) | Live ops/sec sparklines, RAM utilization gauge, hit-rate meter, and auto-detecting health diagnostics. |
| **Key Explorer** | ![Key Explorer](docs/screenshots/keys.png) | Virtualized split-pane browser handling 100k+ keys at 60fps, namespace tree, and typed editors. |
| **Interactive Console** | ![Console](docs/screenshots/console.png) | CodeMirror 6 terminal, multi-command pipelining, AST safety blocking, and persistent history. |
| **Architecture Tour** | ![Architecture Tour](docs/screenshots/tour.png) | Interactive SVG pipeline animating requests from TCP socket to storage engine with live telemetry. |
| **Guided Labs** | ![Guided Labs](docs/screenshots/labs.png) | 6 interactive learning scenarios running in sandbox DB 15 with automated verification. |

*(High-resolution asset captures can be generated via the Playwright visual regression suite).*

---

## 📊 Performance & Bundle Size Report

RedisX Studio utilizes route-level code-splitting with `React.lazy()` and `Suspense`, ensuring the initial route bundle stays well below the strict **250 KB gzip budget**:

| Chunk / Module | Raw Size | Gzip Size | Loading Strategy |
| :--- | :--- | :--- | :--- |
| **Initial Entry (`index.js`)** | **66.28 kB** | **19.40 kB** | Entry chunk loaded on first paint |
| **React Core (`vendor-react`)** | **180.81 kB** | **59.46 kB** | Cached shared framework runtime |
| **Icons (`vendor-icons`)** | **39.90 kB** | **7.25 kB** | Cached Lucide iconography |
| **TOTAL INITIAL LOAD** | **286.99 kB** | **86.11 kB** | **< 35% of 250 KB Budget! ⚡** |
| `vendor-codemirror` | 397.67 kB | 129.81 kB | Lazy-loaded on `/console` & `/playground` |
| `vendor-charts` | 418.32 kB | 119.53 kB | Lazy-loaded on `/metrics` & `/dashboard` |
| All 18 Route Pages | 12.0 – 69.1 kB | 3.8 – 14.4 kB | Asynchronously split per route |

### Virtualized 60 FPS Rendering
The Key Explorer virtualizes large keysets using `@tanstack/react-virtual`:
- **DOM Stability**: Renders only ~20 active DOM nodes regardless of whether 1,000 or 100,000 keys exist.
- **Scroll Frame Rate**: Maintains a locked **60 FPS** scroll with zero main-thread blocking tasks.
- **Debounced Lookups**: Real-time pattern searches (`*user*`) debounced to 250ms to prevent gateway saturation.

---

## 🛡️ Security & Safety Model

RedisX enforces an enterprise-grade defense-in-depth model across the API Gateway:

1. **Zero Command-Injection Vector**:
   - Commands are parsed into typed `string[]` arrays and executed via direct RESP socket tokens (`(ioredis.call(command, ...args)`).
   - Shell string concatenation and shell execution (`exec`/`spawn`) are strictly forbidden.

2. **Secret Redaction**:
   - `AUTH` passwords, `CONFIG SET requirepass`, and `ACL SETUSER >password` parameters are automatically sanitized into `******` before storing in audit logs.
   - Fastify logger headers and request bodies redact `authorization` and `password` fields.

3. **Rate-Limited Authentication**:
   - In-memory sliding window rate limiter permits a maximum of 5 failed login attempts per minute per IP/user, responding with `429 Too Many Requests`.

4. **Safety Guardian Gatekeeper**:
   - Destructive operations (`FLUSHALL`, `FLUSHDB`, `SHUTDOWN`, `DEBUG`, `KEYS *`) are intercepted by the AST Safety Engine.
   - Operators and viewers cannot run dangerous commands; administrators must type **`CONFIRM`** in the confirmation modal before unlocking execution.

5. **Security Headers & Strict CORS**:
   - Full Content Security Policy (CSP), `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` applied to all HTTP responses.
   - CORS locked exclusively to authorized browser origins.

---

## 👥 Role & Permissions Matrix

| Feature / Command Category | Viewer (`viewer`) | Operator (`operator`) | Administrator (`admin`) |
| :--- | :---: | :---: | :---: |
| **Read Operations** (`GET`, `MGET`, `HGETALL`, `SCAN`) | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Standard Keyspace Writes** (`SET`, `HSET`, `LPUSH`) | ❌ Blocked (403) | ✅ Allowed | ✅ Allowed |
| **Key TTL & Expiration** (`EXPIRE`, `PERSIST`) | ❌ Blocked (403) | ✅ Allowed | ✅ Allowed |
| **Key Deletion** (`DEL`, `UNLINK`, Bulk Delete) | ❌ Blocked (403) | ✅ Allowed | ✅ Allowed |
| **Live Pub/Sub Publishing** (`PUBLISH`) | ❌ Read-Only | ✅ Allowed | ✅ Allowed |
| **Configuration Mutations** (`CONFIG SET`) | ❌ Blocked (403) | ❌ Blocked (403) | ✅ Requires Unlock |
| **Destructive Commands** (`FLUSHALL`, `SHUTDOWN`) | ❌ Blocked (403) | ❌ Blocked (403) | ✅ Requires Unlock |
| **ACL User Management** (`ACL SETUSER`, `ACL DELUSER`)| ❌ Blocked (403) | ❌ Blocked (403) | ✅ Allowed |

---

## 🧭 Page Features Matrix & Status Checklist

| Page Route | Primary Capabilities | Status | Server Support |
| :--- | :--- | :---: | :--- |
| **`/dashboard`** | Telemetry sparklines, health diagnostics, condition simulators | **Working** | Full (Native / Demo) |
| **`/keys`** | Split pane, virtualized list, namespace tree, String/Hash/List/Set/ZSet editors, TTL bulk manager | **Working** | Full (Native / Demo) |
| **`/console`** | CodeMirror 6 terminal, autocomplete, explain drawer, pipelining, history modal | **Working** | Full (Native / Demo) |
| **`/playground`** | Interactive visualizer for Strings, Lists, Hashes, Sets, Sorted Sets, Bitmaps, and HyperLogLogs | **Working** | Full (Native / Demo) |
| **`/memory`** | Treemap memory analyzer, fragmentation ratio, eviction simulation | **Working** | Full (Native / Demo) |
| **`/expiration`** | Live TTL countdowns, expiration histogram, lazy vs active expiry simulator | **Working** | Full (Native / Demo) |
| **`/clients`** | Connected clients table, kill client, slow connection detection | **Working** | Full (Native / Demo) |
| **`/slowlog`** | Execution latency threshold log, Big-O root cause hints, reset | **Working** | Full (Native / Demo) |
| **`/persistence`** | Dual AOF/RDB timeline, snapshot inspector, BGSAVE trigger | **Working** | Full (Native / Demo) |
| **`/replication`** | Topology visualizer, lag offset tracker, REPLICAOF configuration | **Working** | Full (Native / Demo) |
| **`/security`** | ACL user editor, password hasher, category permissions builder | **Working** | Full (Native / Demo) |
| **`/config`** | Searchable runtime configurations, live validation, config export | **Working** | Full (Native / Demo) |
| **`/metrics`** | Multi-metric historical chart explorer, p99 latency tracker | **Working** | Full (Native / Demo) |
| **`/monitor`** | Streaming live command monitor with regex filters and pause buffer | **Working** | Full (Native / Demo) |
| **`/pubsub`** | Interactive multi-channel pub/sub tester and message inspector | **Working** | Full (Native / Demo) |
| **`/learn/tour`** | Interactive 9-stage SVG architecture diagram with request tracer | **Working** | Full (Native / Demo) |
| **`/learn/commands`**| Searchable 68+ command catalog, Big-O complexity filters, playground links | **Working** | Full (Native / Demo) |
| **`/learn/labs`** | 6 guided hands-on database scenario labs with automated check verification | **Working** | Sandbox DB 15 |

---

## 🌐 Supported Servers

RedisX Studio communicates over standard RESP2 and RESP3 protocols:
* **RedisX Engine** (`pbRedisDB`): Full support for all core primitives, replication, and telemetry.
* **Redis 6.x, 7.x, 7.2.x**: Full compatibility across all commands and ACL rules.
* **Valkey 7.2+ / KeyDB**: Full compatibility for keyspace inspection and telemetry.
* **Standalone Demo Mode**: 100% offline simulation requiring zero external binaries.

---

## 🚫 What's Not Implemented

To maintain architectural simplicity and focus on high-performance single-node predictability, the following features are intentionally out of scope:
1. **Redis Cluster (Multi-Master Sharding)**: RedisX focuses on master-replica PSYNC topologies; cluster-bus gossip and multi-node hash slot migrations (`CLUSTER SLOTS`) are not implemented.
2. **Lua Scripting Engine (`EVAL`)**: Embedded Lua runtime execution is omitted in favor of atomic multi-command pipelining (`MULTI`/`EXEC`).
3. **Dynamic C Module API (`MODULE LOAD`)**: Dynamic shared library loading is not supported.

---

## 🧪 Testing & Verification

Run the complete test suite across all packages:
```bash
# Run both Gateway and Web test suites
npm test

# Run Gateway integration tests (Auth, Safety, Caps, Zod validation)
npm run test:gateway

# Run Web React component tests (Key Explorer, Editors, Console, Modals)
npm run test:web
```

---

## 📜 License

MIT License. Crafted with precision for distributed systems engineers and database enthusiasts.




## extra image: 

               ┌───────────────────────────────────────────────────────────────┐
               │              DOCKER BRIDGE NETWORK: pbredisdb_default         │
               │                                                               │
               │   ┌───────────┐    proxy /api/     ┌───────────┐              │
               │   │    web    │ ─────────────────► │  gateway  │              │
               │   │ (Port 3000)│                   │(Port 4000)│              │
               │   └───────────┘                    └─────┬─────┘              │
               │                                          │                    │
               │                                          │ RESP TCP           │
               │                                          │ port 6379          │
               │                                          ▼                    │
               │   ┌───────────┐   scrape :9121     ┌───────────┐              │
               │   │prometheus │ ─────────────────► │  redisx   │              │
               │   │(Port 9090)│                    │(Port 6379)│              │
               │   └─────┬─────┘                    └───────────┘              │
               │         ▲                                                     │
               │         │ PromQL query                                        │
               │         │ http://prometheus:9090                              │
               │   ┌─────┴─────┐                                               │
               │   │  grafana  │                                               │
               │   │(Port 3000)│                                               │
               │   └───────────┘                                               │
               └───────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Port Forwarding (Host Ports)
                                      │
              ┌───────────────────────┴────────────────────────┐
              │           YOU / BROWSER / HOST MACHINE         │
              │   • http://localhost:3000 (React Web Studio)   │
              │   • http://localhost:3002 (Grafana Dashboards) │
              │   • localhost:6379        (redis-cli)          │
              └────────────────────────────────────────────────┘