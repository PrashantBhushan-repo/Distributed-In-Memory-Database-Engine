# RedisX Studio implementation review

Reviewed against the supplied 15-step brief on 20 October 2026. This is an improvement of the existing application, with its npm layout preserved. The public landing work and existing engine changes were retained.

The current counts and saved evidence are in [the verification record](verification.md). Follow-up entries below describe the implementation history; their point-in-time counts are superseded by that record.

## What changed

The workspace has a new navigation shell, connection strip, sign-in screen, connection dialog, dashboard, responsive layouts, and a consistent neutral design system. Dashboard values, charts, server identity, and timestamps come from the gateway. Empty charts wait for recorded samples. Demo mode is labeled on every screen. Disconnects preserve the last reading with a stale notice.

Outside the explicit loopback-only playground, the gateway rejects unauthenticated API requests and WebSocket upgrades. The frontend attaches the session token and selected database to requests. Each live database has its own connection; selecting one database cannot issue SELECT on another user's socket. Connection tests perform a real PING with the supplied host, port, password, and TLS options. Administrators can change the shared gateway connection or explicitly select demo mode.

Implicit sample substitutions are blocked across engine adapters. Unsupported commands produce an explicit error instead of fabricated success. Actual COMMAND results drive feature support. Literal environment values such as `DEMO_MODE=false` stay false. Live latency percentiles, network counters, command breakdowns, and replication lag are omitted or identified as unavailable when the engine does not expose them.

The key explorer reads real memory measurements, handles missing encodings, paginates collections, supports bounded small-hash/set reads on engines without HSCAN/SSCAN, preserves TTL on string edits using KEEPTTL, distinguishes expired and persistent keys, and counts existing distinct keys for bulk-delete previews. Atomic removal of a list element by index is explicitly unsupported rather than deleting the first duplicate value accidentally.

The playground executes real commands in DB15 with a fail-closed command allowlist and play: key checks. Live previews show returned values without inventing internal memory layouts. Guided labs use the actual playground endpoint, honor capabilities, reject failed execution, and no longer pass a step when verification fails. Lab resets use the shared preview and confirmation dialog.

Console and gateway pipelines share the same parser with empty quoted arguments and escape handling. Stateful raw commands are blocked on shared sockets. Configuration responses mask sensitive values, exclude unreported parameters, and retain rollback entries if an update fails. Live pub/sub avoids duplicate local broadcasts and synthetic messages.

## Review of the supplied sequence

| Step | Area | Result and remaining limits |
| --- | --- | --- |
| 0 | Foundation | Existing npm projects retained; root dev/build/typecheck/test commands provided. Full pnpm/shadcn/TanStack Query migration and ESLint rollout remain outside this change. |
| 1 | Gateway foundation | Real RESP/ioredis connection, strict auth, literal environment flags, actual command detection, guarded demo adapter, and per-request DB isolation. One shared configured engine target; named per-user targets remain future work. |
| 2 | Shell | Redesigned navigation, sign-in, database selector, verified connection dialog, source indicators, themes, search, and contextual help. |
| 3 | Dashboard and metrics | Live INFO-derived readings, real server identity, recorded history, stale states, and responsive cards. History starts at gateway startup; unavailable percentiles are not synthesized. |
| 4 | Key list | Real SCAN listing, filters, tree, virtualization, optional memory measurements. The 100k-key/60fps performance target has not been benchmarked. |
| 5 | Key details | All five data types verified against C++. Page controls and cursor support added. Without HSCAN/SSCAN, hash/set fallback is bounded to 1,000 total entries; larger collections fail explicitly. Atomic list-index deletion is unavailable. |
| 6 | Console | Browser PING verified; raw and pipeline paths share parsing and policy enforcement. Interactive transactions need a dedicated session and are blocked on pooled sockets. |
| 7 | Memory and expiration | Live overview, sampled top keys, expiration counters, histogram, and sample-based eviction estimate. Fragmentation and unavailable key sizes are not invented. Samples are estimates, not an exhaustive keyspace inventory. |
| 8 | Clients and slow log | Real read endpoints respond successfully against the built engine. Existing mutation controls retained; not every administrative mutation was exercised. |
| 9 | Persistence and replication | Live INFO reads; fabricated snapshot history and coverage removed. Missing statuses say unknown. Live snapshot inspection and replication preflight remain explicitly unsupported; promotion/replication workflows were not exercised on a replica cluster. |
| 10 | Security and configuration | Real ACL/config read endpoints, corrected capability handling, masking, and rollback fixes. Full ACL editing and security policy permutations still need broader integration coverage. |
| 11 | Metrics, monitor, pub/sub | Authenticated streams outside local playground mode, bounded telemetry buffers, explicit source labels, live pub/sub isolation. MONITOR is not supported by the current C++ command table. Prior-period comparison uses recorded windows and explains missing history. |
| 12 | Playground | Real DB15 execution and isolation verified. Internal allocator/encoding diagrams remain demo-only; live mode shows returned data. Threshold transitions require engine introspection support. |
| 13 | Learning | Real architecture counters where reported, repaired reference/lab capabilities and API paths, truthful failure handling. Transaction, eviction, and replication labs remain restricted by sandbox policy and available capabilities. |
| 14 | Hardening | Build, unit tests, live C++ checks, full-route browser smoke, mobile and disconnect checks, and dashboard WCAG AA checks. Added a Studio CI workflow; hosted CI has not been run from this workspace. Full per-page accessibility certification, lint migration, and production security audit remain incomplete. |

## Verified locally

- Fresh C++ Release build in WSL, including a fix for an ignored AOF rollback truncation failure.
- `npm run build`: gateway TypeScript, frontend TypeScript/Vite, and public-page prerendering.
- `npm test`: 38 gateway tests and 50 frontend tests; refreshed during the README rewrite.
- `npm run verify:engine`: 16 checks against the freshly compiled native C++ process, including all five types, direct RESP agreement, TTL changes, deletion, concurrent DB isolation, actual INFO identity, sandbox writes, and administrative API availability.
- `npm run test:studio`: six browser cases cover CRUD/TTL/console, both dashboard themes, mobile/disconnect behavior, scan pagination, Metrics controls and monitoring walkthrough; all 18 routed views are smoke-checked.
- `npm --prefix studio/web run test:metrics-memory`: one large-history/scroll/comparison/visibility/navigation regression under a 128 MiB JS heap limit.
- Initial public-route JavaScript is approximately 81.7 KiB gzip. Charts and CodeMirror remain split into separate chunks; this is not a measurement of the complete Studio download.

`build-studio-verify/api-support.json` records actual API availability. Sixteen administrative read endpoints returned 200; replication preflight returned explicit 501. A successful endpoint response does not certify fields the C++ engine does not report.

Browser screenshots are saved in `build-studio-verify/`. The current README screenshot is `docs/images/studio-dashboard.png`, captured against the isolated engine on 16379 with five temporary real keys, which were removed afterward. Its workload is an example, not a performance benchmark.

## Run and reproduce

Install dependencies with `npm ci --prefix studio/gateway` and `npm ci --prefix studio/web`. Start your C++ engine, set REDIS_HOST/REDIS_PORT and authentication in the environment, then run `npm run dev`. The normal frontend and gateway ports are 3000 and 4000.

For the isolated verification fixture, build with:

```sh
cmake -S . -B build-studio-verify -DCMAKE_BUILD_TYPE=Release -DREDISX_BUILD_TESTS=OFF -DREDISX_BUILD_BENCHMARKS=OFF
cmake --build build-studio-verify -j 4
```

Start that engine on database port 16379 and metrics port 19121 using a config file. Run `npm run verify:engine`; ENGINE_HOST, ENGINE_PORT, and ENGINE_PASSWORD can select another isolated instance. The verifier creates unique temporary keys and cleans them up; use a disposable development engine.

The browser suite expects the gateway on 14000 with REDIS_PORT=16379, DEMO_MODE=false, DEMO_FALLBACK=false, and CORS_ORIGIN=http://127.0.0.1:13000. Start the web dev server on 13000 with REDISX_GATEWAY_URL=http://127.0.0.1:14000. Then run `npm run test:studio`. STUDIO_URL and ENGINE_PORT override its web URL and expected engine port. Local tests use installed Chrome; CI uses Playwright Chromium. The workflow contains the complete Linux launch sequence.

Demo mode is opt-in: set DEMO_MODE=true or choose Use demo as an administrator. The demo dataset uses DB0. The connection dialog changes the engine target for all gateway users, which the dialog explicitly states.

## Follow-up: account-free local access

At the user's request, the local development workspace now opens without sign-in. `STUDIO_PLAYGROUND=true`, `NODE_ENV=development`, a loopback HOST, and a direct loopback peer are all required. The health response tells the frontend whether to show the account-free workspace. The sidebar shows Engine playground instead of an account/sign-out control. Existing login behavior is retained outside this explicitly local mode. Browser tests now perform the complete flow without credentials or tokens. Current automated test count: 28 gateway tests and 36 frontend tests.

## Follow-up: disappearing pages and stalled key scans

The running older engine on port 6379 returned an empty COMMAND/COMMAND LIST response even though SCAN worked. That empty list incorrectly disabled every gated feature after metrics arrived. Discovery now falls back to bounded read-only probes, exposes pending/ready/error states, and retries transport failures. Pages remain mounted during discovery and reconnection. Persistence and replication read pages require INFO; Pub/Sub checks PUBSUB. Unsupported operations still return explicit errors.

Connection generations prevent retired sockets from overwriting the current status or capability list. Connect waits for discovery before returning; reconnect timers and per-database sockets are cleaned up. Sampling discards results from a source that was replaced. The connection dialog restores the actual TLS setting.

Key scans cancel requests for obsolete filters or views and schedule one next page at a time. Empty SCAN pages with a nonzero cursor advance correctly; failures stop scanning with a retryable error. Browser regression coverage verifies pagination remains usable across multiple metrics updates. The user's original localhost:3000 gateway remains connected to port 6379; its data has not been migrated or replaced. The newer compiled engine on port 16379 is separately verified because older binaries still have incomplete command metadata and telemetry.

An interrupted startup health request now keeps the workspace waiting and retries automatically. It does not infer authentication mode from a network failure. Only an explicit authenticated response shows sign-in; local playground access still requires the gateway's explicit confirmation.

Verification: production build passed; 33 gateway and 42 frontend unit tests; 16 integration checks on the newer native engine; four browser tests on localhost:3000 connected to the original port 6379 engine, including CRUD, TTL, all 18 routes, and stable scan pagination.

## Follow-up: usable Metrics page

The page now consumes current WebSocket readings alongside recorded history, rejects obsolete history responses, and freezes both charts and headline values when paused. Range changes cancel old requests; refresh, retry and history error states work explicitly. Comparisons request the actual preceding window and align samples by time, with a partial-coverage notice rather than fabricated previous values. The gateway retains up to 48 hours in memory to support a preceding 24-hour window; history is lost on gateway restart.

Small memory values retain precision in KiB/MiB and an unlimited maxmemory setting is not plotted as a zero-byte ceiling. Measured INFO round-trip time is available on older engines and is clearly distinguished from command latency percentiles, which are still not inferred. Engine-wide network counters are preferred. When those counters are absent, actual gateway socket byte rates are labeled Studio connection traffic and exclude other clients. Replication position is plotted in bytes; it is not presented as replica lag. Command families are shown only when reported.

Chart thresholds support zero, use the chart's units, persist in the browser, show a crossed state, and can be cleared. They are local visual thresholds, not notification rules. CSV exports contain recorded values with UTC timestamps and explicit units. Empty measurements have an explanation instead of an apparently broken chart; unsupported actions are disabled. Browser coverage exercises controls, CSV content, live pause, range changes, failure recovery and mobile width.

## Follow-up: Chrome out-of-memory crash

Reproduced rapid native renderer allocation during Metrics chart redraws, reaching 1,601 MB in roughly ten seconds without forced GC. Reused Intl formatters, memoized mapped chart data and callbacks, capped both history windows, and suspended off-screen/hidden-tab charts and hidden-page history polling. A minute-long live profile stayed around 150–230 MB after the fix. Added formatter-allocation and history-bound unit regressions plus a separate 128 MB JS-heap browser stress suite with 10,000-point fixtures, comparisons, scrolling, visibility changes and repeated navigation. See [the measurement and reproduction notes](metrics-memory.md).
