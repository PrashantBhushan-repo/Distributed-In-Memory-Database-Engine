import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OnboardingTour } from './components/OnboardingTour';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { DashboardPage } from './pages/DashboardPage';
import { MetricsProvider } from './features/metrics/MetricsContext';

import { KeyExplorerPage } from './pages/KeyExplorerPage';
import { ConsolePage } from './pages/ConsolePage';
import { MemoryPage } from './pages/MemoryPage';
import { ExpirationPage } from './pages/ExpirationPage';
import { ClientsPage } from './pages/ClientsPage';
import { SlowlogPage } from './pages/SlowlogPage';
import { PersistencePage } from './pages/PersistencePage';
import { ReplicationPage } from './pages/ReplicationPage';
import { SecurityPage } from './pages/SecurityPage';
import { ConfigPage } from './pages/ConfigPage';
import { MetricsPage } from './pages/MetricsPage';
import { MonitorPage } from './pages/MonitorPage';
import { PubSubPage } from './pages/PubSubPage';
import { PlaygroundPage } from './pages/PlaygroundPage';

export default function App() {
  return (
    <BrowserRouter>
      <MetricsProvider>
        <Layout>
          <Routes>
            {/* Default redirect to Dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

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
          <Route
            path="/learn/tour"
            element={
              <PlaceholderPage
                title="C++20 Architecture Tour"
                description="Visual pipeline of the non-blocking Linux epoll event loop, connection state machine, and RESP parser."
                term="rehash"
                suggestedCommands={['INFO server', 'INFO memory']}
                stepBadge="Learn"
              />
            }
          />
          <Route
            path="/learn/commands"
            element={
              <PlaceholderPage
                title="Command Reference & Algorithmic Complexity"
                description="Complete dictionary of 68+ Redis commands with worst-case Big-O complexities and category filters."
                term="pipelining"
                suggestedCommands={['COMMAND COUNT', 'COMMAND INFO get set']}
                stepBadge="Learn"
              />
            }
          />
          <Route
            path="/learn/labs"
            element={
              <PlaceholderPage
                title="Guided Interactive Database Labs"
                description="Hands-on interactive scenarios for active failover, memory eviction thresholds, and atomic transactions."
                term="eviction"
                suggestedCommands={['MULTI', 'SET lab:key "val"', 'EXEC']}
                stepBadge="Learn"
              />
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
      </MetricsProvider>

      {/* 5-Step First-Run Onboarding Tour Overlay */}
      <OnboardingTour />
    </BrowserRouter>
  );
}
