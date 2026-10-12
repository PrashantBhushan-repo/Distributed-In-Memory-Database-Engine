import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Sparkles, Database, Terminal, Shield, Compass } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  targetHint: string;
  icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. Categorized Navigation Sidebar',
    description: 'Explore all 16 dedicated views grouped into Overview, Data, Runtime, Reliability, Access, Observability, and Guided Labs.',
    targetHint: 'Located on the left sidebar',
    icon: <Compass className="h-5 w-5 text-red-400" />,
  },
  {
    title: '2. SCAN-Driven Key Explorer',
    description: 'Safely inspect in-memory datasets with type-aware editors for Strings, Hashes, Lists, Sets, and Sorted Sets with real-time TTL countdowns.',
    targetHint: 'Navigate to /keys',
    icon: <Database className="h-5 w-5 text-emerald-400" />,
  },
  {
    title: '3. Interactive Web Console',
    description: 'Execute raw Redis commands directly in your browser. Autocompletes commands, formats table outputs, and benchmarks execution duration in milliseconds.',
    targetHint: 'Navigate to /console',
    icon: <Terminal className="h-5 w-5 text-blue-400" />,
  },
  {
    title: '4. Dynamic Server Status Pill',
    description: 'Hover over the top-bar status pill to see connection states, port bindings, latency, and whether you are running against a real RedisX engine or Demo mode.',
    targetHint: 'Top-left navbar pill',
    icon: <Sparkles className="h-5 w-5 text-amber-400" />,
  },
  {
    title: '5. Fast Keyboard Command Palette',
    description: 'Press Ctrl+K (or Cmd+K) from anywhere to instantly jump to any page, or press "?" to view all keyboard shortcuts.',
    targetHint: 'Keyboard shortcut Ctrl+K',
    icon: <Shield className="h-5 w-5 text-purple-400" />,
  },
];

export const OnboardingTour: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('redisx_tour_completed');
    if (!hasSeenTour) {
      setIsVisible(true);
    }

    const handleRestart = () => {
      setCurrentStep(0);
      setIsVisible(true);
    };

    window.addEventListener('redisx_restart_tour', handleRestart);
    return () => window.removeEventListener('redisx_restart_tour', handleRestart);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('redisx_tour_completed', 'true');
    setIsVisible(false);
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleDismiss();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl p-6 text-slate-100 animate-in zoom-in-95">
        {/* Progress Bar & Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-red-400">
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <div className="flex gap-1 ml-2">
              {TOUR_STEPS.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 w-4 rounded-full transition-all ${
                    idx === currentStep ? 'bg-red-500' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>
          <button onClick={handleDismiss} className="text-slate-500 hover:text-white p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step Body */}
        <div className="py-6 space-y-4">
          <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
            {step.icon}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">{step.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-1.5">{step.description}</p>
          </div>
          <div className="text-[11px] font-mono text-slate-500 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80">
            Hint: {step.targetHint}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            onClick={handleDismiss}
            className="text-xs text-slate-500 hover:text-slate-300 font-medium"
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-red-600/20"
            >
              <span>{currentStep === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}</span>
              {currentStep === TOUR_STEPS.length - 1 ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
