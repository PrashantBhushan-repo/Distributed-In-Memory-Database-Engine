import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layers,
  Database,
  RefreshCw,
  Sparkles,
  Info,
  ShieldAlert,
  Trash2,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  PlaygroundDataType,
  PlaygroundInspectResponse,
  StringStructure,
  ListStructure,
  HashStructure,
  SetStructure,
  ZSetStructure,
} from '../features/playground/types';
import { THRESHOLD_PUSH_SCRIPTS } from '../features/playground/lessons';
import { TypePicker } from '../features/playground/TypePicker';
import { PlaygroundConsole } from '../features/playground/PlaygroundConsole';
import { ResetSandboxModal } from '../features/playground/ResetSandboxModal';
import { StringVisualizer } from '../features/playground/visualizers/StringVisualizer';
import { ListVisualizer } from '../features/playground/visualizers/ListVisualizer';
import { HashVisualizer } from '../features/playground/visualizers/HashVisualizer';
import { SetVisualizer } from '../features/playground/visualizers/SetVisualizer';
import { ZSetVisualizer } from '../features/playground/visualizers/ZSetVisualizer';

export const PlaygroundPage: React.FC = () => {
  const [selectedType, setSelectedType] = useState<PlaygroundDataType>('string');
  const [activeKey, setActiveKey] = useState<string>('play:greeting');
  const [inspection, setInspection] = useState<PlaygroundInspectResponse | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Console state
  const [consoleEntries, setConsoleEntries] = useState<
    Array<{ command: string; reply: any; rawReply?: string; isError?: boolean; durationMs?: number }>
  >([]);
  const [executing, setExecuting] = useState(false);

  // Modals & Push Experiment
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPushingThreshold, setIsPushingThreshold] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);

  // Check prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    try {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(media.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } catch {}
  }, []);

  // Update default active key when type changes
  const handleSelectType = (t: PlaygroundDataType) => {
    setSelectedType(t);
    const defaults: Record<PlaygroundDataType, string> = {
      string: 'play:greeting',
      list: 'play:tasks',
      hash: 'play:user:101',
      set: 'play:ports',
      zset: 'play:leaderboard',
      none: 'play:greeting',
    };
    const nextKey = defaults[t];
    setActiveKey(nextKey);
    fetchInspection(nextKey);
  };

  // Inspect key details
  const fetchInspection = useCallback(async (keyName: string) => {
    if (!keyName) return;
    setInspectLoading(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/playground/inspect/${encodeURIComponent(keyName)}`, { headers });
      if (res.ok) {
        const data: PlaygroundInspectResponse = await res.json();
        setInspection(data);
        if (data.exists && data.type !== 'none') {
          setSelectedType(data.type);
        }
      }
    } catch (err) {
      console.error('Error fetching key inspection:', err);
    } finally {
      setInspectLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInspection(activeKey);
  }, [fetchInspection, activeKey]);

  // Execute console command
  const handleExecute = async (cmd: string) => {
    setExecuting(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/playground/exec', {
        method: 'POST',
        headers,
        body: JSON.stringify({ command: cmd, db: 15 }),
      });

      const data = await res.json();
      if (res.ok) {
        setConsoleEntries((prev) => [
          ...prev,
          {
            command: cmd,
            reply: data.reply,
            rawReply: data.rawReply,
            durationMs: data.durationMs,
          },
        ]);

        if (data.inspectedKey) {
          setActiveKey(data.inspectedKey);
        }
        if (data.inspection) {
          setInspection(data.inspection);
          if (data.inspection.exists && data.inspection.type !== 'none') {
            setSelectedType(data.inspection.type);
          }
        } else if (data.inspectedKey) {
          fetchInspection(data.inspectedKey);
        }
      } else {
        setConsoleEntries((prev) => [
          ...prev,
          {
            command: cmd,
            reply: data.error || 'Execution failed',
            rawReply: `(error) ${data.error || 'Execution failed'}`,
            isError: true,
          },
        ]);
      }
    } catch (err: any) {
      setConsoleEntries((prev) => [
        ...prev,
        {
          command: cmd,
          reply: err.message,
          rawReply: `(error) ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setExecuting(false);
    }
  };

  const [searchParams] = useSearchParams();
  const prefillCmd = searchParams.get('cmd');
  const hasRunPrefill = useRef(false);

  useEffect(() => {
    if (prefillCmd && !hasRunPrefill.current) {
      hasRunPrefill.current = true;
      handleExecute(prefillCmd);
    }
  }, [prefillCmd]);

  // Push past threshold routine
  const handlePushPastThreshold = async (type: PlaygroundDataType) => {
    const script = THRESHOLD_PUSH_SCRIPTS[type];
    if (!script || isPushingThreshold) return;

    setIsPushingThreshold(true);
    setNarration('Starting encoding threshold demonstration...');

    for (let i = 0; i < script.commands.length; i++) {
      const cmd = script.commands[i];
      const stepText = script.narrative[i] || `Running: ${cmd}`;
      setNarration(stepText);

      await handleExecute(cmd);
      // Brief pause between commands so user watches the animation transition
      await new Promise((r) => setTimeout(r, 1200));
    }

    setNarration('Threshold crossed successfully! Notice the updated encoding badge and memory structure.');
    setIsPushingThreshold(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] space-y-3">
      {/* Top Banner / Sandbox Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-600/10 border border-red-500/20 text-red-500">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">Data Types & Encodings Playground</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                SANDBOX DB 15
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolated laboratory to observe how Redis flips underlying memory encodings (listpack ↔ quicklist, intset ↔ hashtable, embstr ↔ raw).
            </p>
          </div>
        </div>

        {/* Key Inspector Bar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
            <span className="text-slate-500">Key:</span>
            <input
              type="text"
              value={activeKey}
              onChange={(e) => setActiveKey(e.target.value)}
              onBlur={() => fetchInspection(activeKey)}
              className="bg-transparent border-none text-slate-100 focus:outline-none w-36 font-bold"
            />
          </div>
          <button
            onClick={() => fetchInspection(activeKey)}
            title="Refresh Inspection"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${inspectLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Threshold Push Narration Callout */}
      {narration && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{narration}</span>
          </div>
          <button
            onClick={() => setNarration(null)}
            className="text-[11px] text-amber-400 hover:text-amber-200 ml-2"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* 3-PANE WORKSPACE: Left (Lessons) | Center (Console) | Right (Visualizer) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* LEFT PANE: Type Picker & Curated Lessons (3 cols) */}
        <div className="lg:col-span-3 h-full min-h-0 overflow-hidden">
          <TypePicker
            selectedType={selectedType}
            onSelectType={handleSelectType}
            onRunCommand={handleExecute}
            onPushPastThreshold={handlePushPastThreshold}
            isPushingThreshold={isPushingThreshold}
          />
        </div>

        {/* CENTER PANE: Mini Interactive Console (4 cols) */}
        <div className="lg:col-span-4 h-full min-h-0 overflow-hidden">
          <PlaygroundConsole
            entries={consoleEntries}
            onExecute={handleExecute}
            onOpenResetModal={() => setIsResetModalOpen(true)}
            onClearConsole={() => setConsoleEntries([])}
            executing={executing}
          />
        </div>

        {/* RIGHT PANE: Internal Architecture Visualizer (5 cols) */}
        <div className="lg:col-span-5 h-full min-h-0 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Internal Memory Structure
              </h2>
            </div>
            {inspection && (
              <span className="text-[11px] font-mono text-slate-400">
                Memory: ~{inspection.memoryBytes} Bytes
              </span>
            )}
          </div>

          {!inspection || !inspection.exists ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <HardDrive className="w-8 h-8 mx-auto text-slate-600" />
              <p>Key <strong>{activeKey}</strong> does not exist in sandbox DB 15.</p>
              <p className="text-[11px] text-slate-600">
                Run a command on the left to initialize this data structure.
              </p>
            </div>
          ) : (
            <>
              {/* Dynamic Visualizer based on inspected structure */}
              {inspection.structure?.type === 'string' && (
                <StringVisualizer structure={inspection.structure as StringStructure} reducedMotion={reducedMotion} />
              )}
              {inspection.structure?.type === 'list' && (
                <ListVisualizer structure={inspection.structure as ListStructure} reducedMotion={reducedMotion} />
              )}
              {inspection.structure?.type === 'hash' && (
                <HashVisualizer structure={inspection.structure as HashStructure} reducedMotion={reducedMotion} />
              )}
              {inspection.structure?.type === 'set' && (
                <SetVisualizer structure={inspection.structure as SetStructure} reducedMotion={reducedMotion} />
              )}
              {inspection.structure?.type === 'zset' && (
                <ZSetVisualizer structure={inspection.structure as ZSetStructure} reducedMotion={reducedMotion} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Reset Sandbox Modal */}
      <ResetSandboxModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onResetConfirmed={() => {
          fetchInspection(activeKey);
          setConsoleEntries([]);
        }}
      />
    </div>
  );
};
