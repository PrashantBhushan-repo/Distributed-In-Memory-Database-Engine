import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OnboardingTour } from './components/OnboardingTour';
import { MetricsProvider } from './features/metrics/MetricsContext';
import { SessionGate } from './components/SessionGate';
import './studio.css';
export default function StudioShell() {
  return <SessionGate><MetricsProvider><Layout><Outlet /></Layout><OnboardingTour /></MetricsProvider></SessionGate>;
}
