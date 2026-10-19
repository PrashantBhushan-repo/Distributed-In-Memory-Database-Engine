# Metrics page memory regression

Chrome's “Aw, Snap! / Out of Memory” error was reproduced on the local Metrics page. With normal browser garbage collection, an isolated profiling browser's renderer private memory increased from 186 MiB to 1,601 MiB in about ten seconds. The JavaScript heap increased from 35 MiB to 59 MiB, so checking the JS heap alone missed the native allocation pressure. Forced garbage collection also hid the rapid growth.

Repeated locale formatting during chart redraws created native ICU formatting resources. All seven charts were mounted, including below the visible area. Chart definitions, mapped data and callbacks were recreated on unrelated context updates. Those issues amplified allocation pressure.

The fix reuses Intl date/number formatters, memoizes chart inputs and callbacks, bounds current and previous histories to 360 points each, and renders at most 120 points per series. Charts mount only when visible or near the viewport and stop rendering in hidden tabs. Hidden Metrics pages stop polling history and reload it when visible again. Duplicate samples preserve existing history references. Observers, visibility listeners and request timers are cleaned up on unmount.

After the change, the same natural-GC profile stayed around 150–230 MiB over a minute, with two charts mounted in the measured viewport. This is a local measurement, not a universal memory ceiling. Browser versions, viewport, other extensions and available system memory can affect results.

## Reproduce

Start the frontend, gateway and engine, then run in PowerShell from the repository root:

```powershell
$env:STUDIO_URL = 'http://localhost:3000'
npm --prefix studio/web run test:metrics-memory
```

The isolated browser test uses a 128 MiB JS heap limit, a 10,000-point history fixture, comparisons, scrolling, tab-visibility changes and repeated route navigation. It checks retained sample limits, hidden-chart cleanup, JS heap and (on Windows) total renderer private memory. It does not force garbage collection during the workload. The final retained-heap check runs after GC. The test report includes the memory samples. The Studio CI workflow runs the same test against its isolated app fixture.

To profile real live data without synthetic fixtures:

```powershell
cd studio/web
$env:PROFILE_LABEL = 'metrics-live'
node scripts/profile-metrics.mjs
```

`METRICS_PROFILE_URL` can override the default `http://localhost:3000/metrics`. `PROFILE_SAMPLES` and `PROFILE_INTERVAL_MS` control duration. Leave `PROFILE_FORCE_GC` unset for normal browser behavior. The profiler opens and closes its own browser and saves results under `build-studio-verify/profile-*.json`; it stops the measurement if renderer private memory exceeds 1 GiB.
