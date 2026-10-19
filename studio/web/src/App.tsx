import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './features/landing/LandingPage';
const StudioShell = React.lazy(() => import('./StudioShell'));

// Route-level code-splitting with React.lazy
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const KeyExplorerPage = React.lazy(() => import('./pages/KeyExplorerPage').then((m) => ({ default: m.KeyExplorerPage })));
const ConsolePage = React.lazy(() => import('./pages/ConsolePage').then((m) => ({ default: m.ConsolePage })));
const PlaygroundPage = React.lazy(() => import('./pages/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })));
const MemoryPage = React.lazy(() => import('./pages/MemoryPage').then((m) => ({ default: m.MemoryPage })));
const ExpirationPage = React.lazy(() => import('./pages/ExpirationPage').then((m) => ({ default: m.ExpirationPage })));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const SlowlogPage = React.lazy(() => import('./pages/SlowlogPage').then((m) => ({ default: m.SlowlogPage })));
const PersistencePage = React.lazy(() => import('./pages/PersistencePage').then((m) => ({ default: m.PersistencePage })));
const ReplicationPage = React.lazy(() => import('./pages/ReplicationPage').then((m) => ({ default: m.ReplicationPage })));
const SecurityPage = React.lazy(() => import('./pages/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const ConfigPage = React.lazy(() => import('./pages/ConfigPage').then((m) => ({ default: m.ConfigPage })));
const MetricsPage = React.lazy(() => import('./pages/MetricsPage').then((m) => ({ default: m.MetricsPage })));
const MonitorPage = React.lazy(() => import('./pages/MonitorPage').then((m) => ({ default: m.MonitorPage })));
const PubSubPage = React.lazy(() => import('./pages/PubSubPage').then((m) => ({ default: m.PubSubPage })));
const LearnTourPage = React.lazy(() => import('./pages/LearnTourPage').then((m) => ({ default: m.LearnTourPage })));
const LearnCommandsPage = React.lazy(() => import('./pages/LearnCommandsPage').then((m) => ({ default: m.LearnCommandsPage })));
const LearnLabsPage = React.lazy(() => import('./pages/LearnLabsPage').then((m) => ({ default: m.LearnLabsPage })));

const PageLoader: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-8" role="status" aria-label="Loading page">
    <div className="w-9 h-9 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    <span className="mt-3 text-xs text-zinc-500 font-mono tracking-wider uppercase">Loading RedisX Module...</span>
  </div>
);

export function AppRoutes() {
  return (

<Suspense fallback={<PageLoader />}>
      <Routes>
              {/* Public pages are separate from the Studio shell. */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/compare/redis" element={<LandingPage compare />} />
              <Route element={<StudioShell />}>

              {/* 1. Dashboard (Interactive Live Stream & Health Status) */}
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* 2. Key Explorer (Split Pane, Virtualized List & Tree) */}
              <Route path="/keys" element={<KeyExplorerPage />} />

              {/* 3. Interactive Console (CodeMirror 6, Explain, Pipeline) */}
              <Route path="/console" element={<ConsolePage />} />

              {/* 4. Data Types Playground */}
              <Route path="/playground" element={<PlaygroundPage />} />

              {/* 5. Memory & Eviction (Heap Analyzer & Simulator) */}
              <Route path="/memory" element={<MemoryPage />} />

              {/* 6. Expiration & TTL (Live Countdowns & Histogram) */}
              <Route path="/expiration" element={<ExpirationPage />} />

              {/* 7. Clients */}
              <Route path="/clients" element={<ClientsPage />} />

              {/* 8. Slow Log */}
              <Route path="/slowlog" element={<SlowlogPage />} />

              {/* 9. Persistence */}
              <Route path="/persistence" element={<PersistencePage />} />

              {/* 10. Replication */}
              <Route path="/replication" element={<ReplicationPage />} />

              {/* 11. Security & ACL */}
              <Route path="/security" element={<SecurityPage />} />

              {/* 12. Configuration */}
              <Route path="/config" element={<ConfigPage />} />

              {/* 13. Metrics */}
              <Route path="/metrics" element={<MetricsPage />} />

              {/* 14. Live Monitor */}
              <Route path="/monitor" element={<MonitorPage />} />

              {/* 15. Pub/Sub */}
              <Route path="/pubsub" element={<PubSubPage />} />

              {/* 16. Learn Sub-Routes */}
              <Route path="/learn" element={<Navigate to="/learn/tour" replace />} />
              <Route path="/learn/tour" element={<LearnTourPage />} />
              <Route path="/learn/commands" element={<LearnCommandsPage />} />
              <Route path="/learn/labs" element={<LearnLabsPage />} />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
      </Routes>
    </Suspense>

);
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
