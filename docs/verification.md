# Verification record

Checked on **20 October 2026** against the local working tree. This record distinguishes fresh application checks from the saved C++ audit and earlier browser runs. It does not describe a release or a deployed production system.

The machine-readable index is [local-verification.json](evidence/local-verification.json). The available development environment was Windows with WSL2, Node.js 24.14.0, npm 11.9.0, Chrome 155.0.8059.84, GCC 15.2.0, and CMake 4.2.3. The Linux kernel reported `6.18.33.2-microsoft-standard-WSL2`. Compiler versions for archived runs should be read from their original build records; the available toolchain is not a fresh sanitizer run.

## Application checks

| Area | Result | Evidence and scope |
| --- | --- | --- |
| Gateway unit/integration suite | **38 passed** | `npm test`, rerun for this README; [test sources](../studio/gateway/test) |
| Frontend unit/component suite | **50 passed** | Same fresh run; [test sources](../studio/web/src/test), including history bounds and formatter reuse |
| Studio to native engine | **16 checks passed** | Rerun against the freshly built C++ engine on 16379; [verifier](../studio/gateway/scripts/verify-engine.mjs) |
| Normal browser suite | **6 passed** | Completed during the preceding code verification; [run status](evidence/browser-last-run.json), [cases](../studio/web/e2e/studio.spec.ts) |
| Routed views | **18 exercised** | A route-render smoke check within the six browser cases; not 18 complete end-to-end mutation workflows |
| Browser memory regression | **1 passed** | [Run status](evidence/memory-test-last-run.json), [workload and assertions](../studio/web/e2e/metrics-memory.spec.ts) |
| Administrative read endpoints | **16 HTTP 200; 1 HTTP 501** | [Captured responses](evidence/native-api-support.json); replication preflight is explicitly unsupported |

The native verifier creates all five core data types, compares values against direct RESP reads, preserves TTL during edits, exercises separate DB1/DB2 sockets, scans actual keys, executes sandbox commands in DB15, and removes its unique temporary keys. It also checks measured response time and network measurement scope. A successful read endpoint is not proof that every reported field or administrative mutation is supported.

The browser suite covers create/edit/expire/delete, console PING, disconnect/stale-data behavior, scan pagination, Metrics controls and CSV export, and the monitoring walkthrough. It includes mobile width checks and axe checks for both dashboard themes and the monitoring panel. It is not a whole-application accessibility certification.

## Metrics memory diagnosis

These are isolated Chrome renderer measurements on the same live Metrics page at a 1440 × 1000 viewport. Garbage collection was **not forced** during either recorded run. Memory values are **MiB**; the raw JSON field names retain the profiler's original `MB` suffix.

| Run | Observation | Raw record |
| --- | --- | --- |
| Before the fix | Renderer private memory **186 → 1,601 MiB** in roughly 10 seconds; JS heap **35.1 → 58.5 MiB** | [Before](evidence/metrics-before.json) |
| After the fix | Renderer private memory stayed **150–230 MiB** over one minute; final sample **226 MiB** | [After](evidence/metrics-after.json) |

The initial run stopped at the profiler's 1 GiB safety threshold once the next measurement exceeded it. The memory discrepancy matters: a modest JS heap did not reveal the native allocation pressure. Caching Intl formatters, memoizing chart inputs, bounding histories, and suspending invisible plots addressed the reproduced failure.

The separate stress test supplies **10,000 history points**, enables comparisons, scrolls through chart rows, changes document visibility, and navigates away/back three times. It runs Chrome with a **128 MiB JS old-space limit**. Assertions check at most **360 retained samples**, JS heap below **128 MiB**, Windows renderer private memory below **512 MiB** at each measured interval, and a final post-GC retained heap below **64 MiB**. The test does not force GC during the workload. These are regression-test bounds, not process-memory guarantees for every browser and workload.

See [the memory reproduction guide](metrics-memory.md). The profiler uses its own browser, never the user's existing Chrome session.

## Recorded engine audit

The following runs were recorded on **19 October 2026**. Their saved logs were checked for this README; sanitizer and fuzz runs were not repeated during this documentation change.

| Run | Result |
| --- | --- |
| GCC Debug CTest | **94/94 passed** |
| Clang ASan + UBSan CTest | **94/94 passed** |
| Clang TSan CTest | **94/94 passed** |
| libFuzzer with sanitizers | **419,081 executions in 301 seconds**, no detected crash in the recorded run |
| redis-cli pipeline | **1,000 writes**, zero reported errors in the recorded client check |

[Saved log summaries](evidence/engine-audit-summary.txt) identify the original files. The [engine audit](engine-audit.md) details the fixes, the grouped real-server scenarios, actual redis-py checks, and remaining boundaries. The 94 registered CTest checks include a grouped ServerAudit scenario; they are not all independent process or cluster campaigns. Passing TSan on the exercised paths is not a declaration that arbitrary cross-thread engine mutation is safe.

## Build measurement

The recent production build passed TypeScript, Vite, and public-page prerendering. Its reported initial public-route JavaScript is **81.7 KiB gzip**, below the configured **150 KiB** initial-route budget. The [prerender script](../studio/web/scripts/prerender.mjs) calculates this from the entry's imported assets. Studio route chunks, Recharts, CodeMirror, CSS, and later requests are outside that number. It is not a complete application transfer size.

## Reproduce

From the repository root:

```powershell
npm run typecheck
npm test
npm run build

# Start the app and engine before browser checks.
$env:STUDIO_URL = 'http://localhost:3000'
$env:ENGINE_PORT = '6379'
npm run test:studio
npm --prefix studio/web run test:metrics-memory
```

For native integration, start a separate current engine on **16379**, then set `$env:ENGINE_PORT = '16379'` and run `npm run verify:engine`. The [CI workflow](../.github/workflows/studio.yml) includes a disposable engine config and the isolated gateway/web launch sequence. Browser credentials are not needed in the explicitly local playground mode used by the fixture.

For Debug and sanitizers, follow [the engine audit](engine-audit.md#reproduce) and [testing guide](testing.md). For command-path throughput work, run and preserve a new benchmark against the current build. The [older benchmark report](benchmarks.md) predates the audit; its throughput and latency figures are historical and are not current acceptance criteria.
