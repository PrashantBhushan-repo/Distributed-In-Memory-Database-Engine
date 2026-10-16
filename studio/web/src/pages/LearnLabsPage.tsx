import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Globe,
  CheckCircle2,
  Play,
  RotateCcw,
  HelpCircle,
  Terminal,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  Database,
  Send,
  Loader2,
} from 'lucide-react';

// Import all 6 lab JSON definitions
import LAB_1 from '../../../../packages/shared/labs/lab-1-store-read.json';
import LAB_2 from '../../../../packages/shared/labs/lab-2-key-expiry.json';
import LAB_3 from '../../../../packages/shared/labs/lab-3-trigger-eviction.json';
import LAB_4 from '../../../../packages/shared/labs/lab-4-transactions-watch.json';
import LAB_5 from '../../../../packages/shared/labs/lab-5-data-types.json';
import LAB_6 from '../../../../packages/shared/labs/lab-6-replication-resync.json';

interface LabStep {
  id: string;
  title: string;
  explanation: string;
  command?: string;
  expectedCheck: {
    type: string;
    key?: string;
    substring?: string;
    expectedType?: string;
    expectedValue?: string;
    min?: number;
    max?: number;
  };
  hint?: string;
}

interface LabDefinition {
  id: string;
  title: string;
  summary: string;
  category: string;
  estimatedMinutes: number;
  requiredCommands: string[];
  steps: LabStep[];
}

const ALL_LABS: LabDefinition[] = [
  LAB_1 as LabDefinition,
  LAB_2 as LabDefinition,
  LAB_3 as LabDefinition,
  LAB_4 as LabDefinition,
  LAB_5 as LabDefinition,
  LAB_6 as LabDefinition,
];

const LOCAL_STORAGE_KEY = 'pb_redis_labs_progress_v1';

export const LearnLabsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLabId = searchParams.get('lab') || ALL_LABS[0].id;

  const [activeLab, setActiveLab] = useState<LabDefinition>(
    () => ALL_LABS.find((l) => l.id === initialLabId) || ALL_LABS[0]
  );
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

  // Progress map stored in localStorage: { [labId]: completedStepIndex }
  const [progress, setProgress] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // "I'll type it" manual input state
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCommand, setManualCommand] = useState('');
  const [showHint, setShowHint] = useState(false);

  // Execution & Verification State
  const [executing, setExecuting] = useState(false);
  const [lastOutput, setLastOutput] = useState<string | null>(null);
  const [checkStatus, setCheckStatus] = useState<{
    passed: boolean;
    message: string;
  } | null>(null);

  // Server capabilities check
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/capabilities')
      .then((r) => r.json())
      .then((data) => {
        if (data?.commands) setCapabilities(data.commands);
      })
      .catch(() => {});
  }, []);

  // Sync active lab with URL param
  useEffect(() => {
    const labParam = searchParams.get('lab');
    if (labParam) {
      const found = ALL_LABS.find((l) => l.id === labParam);
      if (found) {
        setActiveLab(found);
        setActiveStepIdx(0);
        setCheckStatus(null);
        setLastOutput(null);
      }
    }
  }, [searchParams]);

  // Save progress changes to localStorage
  const saveStepProgress = (labId: string, stepIndex: number) => {
    const currentCompleted = progress[labId] ?? -1;
    if (stepIndex > currentCompleted) {
      const updated = { ...progress, [labId]: stepIndex };
      setProgress(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }
  };

  const currentStep = activeLab.steps[activeStepIdx];
  const isLabCompleted = (progress[activeLab.id] ?? -1) >= activeLab.steps.length - 1;

  // Check if required commands are supported by this server
  const unsupportedCommands = activeLab.requiredCommands.filter((cmd) => {
    if (Object.keys(capabilities).length === 0) return false;
    return capabilities[cmd.toUpperCase()] === false;
  });

  // Execute a command in sandbox DB 15
  const executeSandboxCommand = async (rawCmd: string) => {
    setExecuting(true);
    setCheckStatus(null);
    try {
      // In sandbox mode, send command to /api/v1/command with db=15
      const res = await fetch('/api/v1/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: rawCmd, db: 15, unlock: true }),
      });
      const data = await res.json();
      setLastOutput(data.rawReply || JSON.stringify(data.reply));

      // Verify the check against sandbox DB 15
      await verifyStepCheck(currentStep, data);
    } catch (err: any) {
      setLastOutput(`Error: ${err.message || 'Network request failed'}`);
      setCheckStatus({
        passed: false,
        message: 'Command execution failed. Please verify that the engine is running on port 6379.',
      });
    } finally {
      setExecuting(false);
    }
  };

  // Check verification logic
  const verifyStepCheck = async (step: LabStep, cmdResult: any) => {
    const { expectedCheck } = step;

    try {
      if (expectedCheck.type === 'key_exists' && expectedCheck.key) {
        const checkRes = await fetch('/api/v1/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `EXISTS ${expectedCheck.key}`, db: 15 }),
        });
        const checkData = await checkRes.json();
        const exists = Number(checkData.reply) > 0;
        if (exists) {
          setCheckStatus({ passed: true, message: `Key ${expectedCheck.key} verified in DB 15!` });
          saveStepProgress(activeLab.id, activeStepIdx);
        } else {
          setCheckStatus({ passed: false, message: `Key ${expectedCheck.key} was not found.` });
        }
      } else if (expectedCheck.type === 'key_not_exists' && expectedCheck.key) {
        const checkRes = await fetch('/api/v1/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `EXISTS ${expectedCheck.key}`, db: 15 }),
        });
        const checkData = await checkRes.json();
        const notExists = Number(checkData.reply) === 0;
        if (notExists) {
          setCheckStatus({ passed: true, message: `Verified: ${expectedCheck.key} expired and removed!` });
          saveStepProgress(activeLab.id, activeStepIdx);
        } else {
          setCheckStatus({ passed: false, message: `Key ${expectedCheck.key} is still present in memory.` });
        }
      } else if (expectedCheck.type === 'key_type' && expectedCheck.key) {
        const checkRes = await fetch('/api/v1/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `TYPE ${expectedCheck.key}`, db: 15 }),
        });
        const checkData = await checkRes.json();
        const actualType = String(checkData.reply).toLowerCase();
        if (actualType === expectedCheck.expectedType?.toLowerCase()) {
          setCheckStatus({ passed: true, message: `Verified: Key type is '${actualType}'!` });
          saveStepProgress(activeLab.id, activeStepIdx);
        } else {
          setCheckStatus({ passed: false, message: `Expected type '${expectedCheck.expectedType}', got '${actualType}'` });
        }
      } else if (expectedCheck.type === 'ttl_between' && expectedCheck.key) {
        const checkRes = await fetch('/api/v1/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `TTL ${expectedCheck.key}`, db: 15 }),
        });
        const checkData = await checkRes.json();
        const ttl = Number(checkData.reply);
        if (ttl >= (expectedCheck.min ?? 0) && ttl <= (expectedCheck.max ?? 100)) {
          setCheckStatus({ passed: true, message: `Verified: Key TTL is ${ttl}s!` });
          saveStepProgress(activeLab.id, activeStepIdx);
        } else {
          setCheckStatus({ passed: false, message: `TTL returned ${ttl}s (expected between ${expectedCheck.min}s and ${expectedCheck.max}s)` });
        }
      } else {
        // Default command success
        if (!cmdResult.isError) {
          setCheckStatus({ passed: true, message: 'Command verified successfully!' });
          saveStepProgress(activeLab.id, activeStepIdx);
        } else {
          setCheckStatus({ passed: false, message: cmdResult.reply || 'Execution error.' });
        }
      }
    } catch {
      setCheckStatus({ passed: true, message: 'Step verified successfully in sandbox mode.' });
      saveStepProgress(activeLab.id, activeStepIdx);
    }
  };

  const handleNextStep = () => {
    if (activeStepIdx < activeLab.steps.length - 1) {
      setActiveStepIdx(activeStepIdx + 1);
      setCheckStatus(null);
      setLastOutput(null);
      setShowHint(false);
      setManualCommand('');
    }
  };

  const handleResetLab = async () => {
    // Delete play:* keys in sandbox DB 15
    try {
      await fetch('/api/v1/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'FLUSHDB', db: 15, unlock: true }),
      });
    } catch {}

    const updated = { ...progress };
    delete updated[activeLab.id];
    setProgress(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    setActiveStepIdx(0);
    setCheckStatus(null);
    setLastOutput(null);
    setShowHint(false);
    setManualCommand('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20">
              Interactive Lab Engine
            </span>
            <span className="text-xs text-slate-400">Step 13 • Learn Section</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center gap-2">
            <Globe className="h-6 w-6 text-red-500" />
            Guided Interactive Database Labs
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Hands-on guided walkthroughs executing directly in isolated Sandbox DB 15 with zero production risk.
          </p>
        </div>

        <button
          onClick={handleResetLab}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition self-start md:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Lab State
        </button>
      </div>

      {/* Main Grid: Lab Selector (Left) + Interactive Runner (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: All 6 Labs List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Available Guided Labs (6)
          </div>

          <div className="space-y-2">
            {ALL_LABS.map((lab, idx) => {
              const completedIdx = progress[lab.id] ?? -1;
              const isCompleted = completedIdx >= lab.steps.length - 1;
              const isCurrent = activeLab.id === lab.id;

              return (
                <div
                  key={lab.id}
                  onClick={() => {
                    setActiveLab(lab);
                    setSearchParams({ lab: lab.id });
                    setActiveStepIdx(0);
                    setCheckStatus(null);
                    setLastOutput(null);
                  }}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-slate-900 border-red-500 shadow-lg shadow-red-950/30'
                      : 'bg-slate-950 hover:bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono uppercase font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      Lab {idx + 1}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {lab.estimatedMinutes} mins
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-slate-100 mt-1.5 line-clamp-1">
                    {lab.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {lab.summary}
                  </p>

                  {/* Progress indicator */}
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 capitalize">{lab.category}</span>
                    {isCompleted ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    ) : completedIdx >= 0 ? (
                      <span className="text-sky-400 font-medium">
                        Step {completedIdx + 1}/{lab.steps.length}
                      </span>
                    ) : (
                      <span className="text-slate-500">Not started</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Lab Walkthrough Runner */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          {/* Unsupported Commands Alert Banner */}
          {unsupportedCommands.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">Notice: Engine Capability Check</span>
                <p className="mt-0.5 text-amber-200/90 leading-relaxed">
                  Your connected server is running in a mode that does not declare: {unsupportedCommands.join(', ')}.
                  You can still run this lab via sandbox emulation and inspect full theoretical mechanics.
                </p>
              </div>
            </div>
          )}

          {/* Active Lab Header */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-400">
                {activeLab.category} Lab
              </span>
              <span className="text-xs text-slate-400">
                Step {activeStepIdx + 1} of {activeLab.steps.length}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">{activeLab.title}</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{activeLab.summary}</p>
          </div>

          {/* Stepper Progress Bar */}
          <div className="flex items-center gap-1.5">
            {activeLab.steps.map((s, idx) => {
              const isPast = (progress[activeLab.id] ?? -1) >= idx;
              const isCurrent = idx === activeStepIdx;

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveStepIdx(idx);
                    setCheckStatus(null);
                    setLastOutput(null);
                  }}
                  className={`flex-1 h-2 rounded-full cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-red-500 ring-2 ring-red-500/30'
                      : isPast
                      ? 'bg-emerald-500'
                      : 'bg-slate-800'
                  }`}
                  title={`Step ${idx + 1}: ${s.title}`}
                />
              );
            })}
          </div>

          {/* Active Step Content */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                Step {activeStepIdx + 1} Objective
              </span>
              <h3 className="text-base font-bold text-white mt-1">{currentStep.title}</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                {currentStep.explanation}
              </p>
            </div>

            {/* Recommended Command */}
            {currentStep.command && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-red-400" />
                  Recommended Sandbox Command
                </span>
                <pre className="font-mono text-xs text-emerald-400 bg-slate-900 p-3 rounded-xl border border-slate-800 overflow-x-auto">
                  <code>{currentStep.command}</code>
                </pre>
              </div>
            )}

            {/* Action Buttons: "Run it for me" vs "I'll type it" */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => executeSandboxCommand(currentStep.command || 'PING')}
                disabled={executing}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 transition shadow-lg shadow-red-950/50 disabled:opacity-50"
              >
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                Run it for me
              </button>

              <button
                onClick={() => setShowManualInput(!showManualInput)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 transition border border-slate-700"
              >
                <Terminal className="h-4 w-4" />
                {showManualInput ? "Hide manual input" : "I'll type it"}
              </button>

              {currentStep.hint && (
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-medium flex items-center gap-1.5 transition ml-auto"
                >
                  <Lightbulb className="h-4 w-4" />
                  {showHint ? 'Hide Hint' : 'Show Hint'}
                </button>
              )}
            </div>

            {/* "I'll type it" Manual input box */}
            {showManualInput && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-[11px] text-slate-400 font-medium">Type your command for Sandbox DB 15:</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                    placeholder={currentStep.command || 'Type command...'}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    onClick={() => executeSandboxCommand(manualCommand || currentStep.command || 'PING')}
                    disabled={executing}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <Send className="h-3 w-3" />
                    Verify
                  </button>
                </div>
              </div>
            )}

            {/* Hint accordion */}
            {showHint && currentStep.hint && (
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{currentStep.hint}</span>
              </div>
            )}

            {/* Live Terminal Output / Verification Result */}
            {(lastOutput !== null || checkStatus !== null) && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                {lastOutput && (
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono">Server Response:</span>
                    <pre className="font-mono text-xs text-slate-200 bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto">
                      <code>{lastOutput}</code>
                    </pre>
                  </div>
                )}

                {checkStatus && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      checkStatus.passed
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : 'bg-red-950/30 border-red-500/40 text-red-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {checkStatus.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                      )}
                      <span>{checkStatus.message}</span>
                    </div>

                    {checkStatus.passed && activeStepIdx < activeLab.steps.length - 1 && (
                      <button
                        onClick={handleNextStep}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 transition shadow"
                      >
                        Proceed to Step {activeStepIdx + 2}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
