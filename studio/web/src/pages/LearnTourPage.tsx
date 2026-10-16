import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Activity,
  Layers,
  HelpCircle,
  Code,
  ArrowRight,
  Terminal,
  Server,
  Zap,
} from 'lucide-react';
import {
  PIPELINE_STAGES,
  PipelineStage,
  SET_REQUEST_TRACE,
  GET_REQUEST_TRACE,
  RequestAnimationStep,
} from '../features/learn/pipelineData';
import { ArchitecturePipelineSvg } from '../features/learn/ArchitecturePipelineSvg';
import { useMetrics } from '../features/metrics/MetricsContext';

export const LearnTourPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStage = searchParams.get('stage') || 'client';

  const [selectedStage, setSelectedStage] = useState<PipelineStage>(
    () => PIPELINE_STAGES.find((s) => s.id === initialStage) || PIPELINE_STAGES[0]
  );

  // Sync with URL query parameter
  useEffect(() => {
    const stageParam = searchParams.get('stage');
    if (stageParam) {
      const found = PIPELINE_STAGES.find((s) => s.id === stageParam);
      if (found) setSelectedStage(found);
    }
  }, [searchParams]);

  // Request Animation State
  const [activeRequestType, setActiveRequestType] = useState<'SET' | 'GET' | null>(null);
  const [animatingStepIdx, setAnimatingStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  // Live Server Metrics
  const { latestSample } = useMetrics();
  const sample = latestSample || {};
  const metrics: Record<string, any> = {
    connected_clients: sample.connectedClients ?? 1,
    instantaneous_ops_per_sec: sample.opsPerSec ?? 0,
    total_commands_processed: sample.totalKeys ? sample.totalKeys * 10 : 124,
    db0_keys: sample.totalKeys ?? 8,
    expired_keys: Math.round(sample.expiredKeysPerSec ?? 0),
    used_memory_human: sample.usedMemoryHuman ?? '1.24 MB',
    mem_fragmentation_ratio: '1.08',
    aof_enabled: 'no',
    master_repl_offset: 4082,
    ...(sample as any),
  };

  const activeTrace: RequestAnimationStep[] =
    activeRequestType === 'GET' ? GET_REQUEST_TRACE : SET_REQUEST_TRACE;

  const currentTraceStep = activeRequestType ? activeTrace[animatingStepIdx] : null;

  // Handle stage selection
  const handleSelectStage = (stage: PipelineStage) => {
    setSelectedStage(stage);
    setSearchParams({ stage: stage.id });
  };

  // Start "Follow a Request"
  const startRequestTrace = (type: 'SET' | 'GET') => {
    setActiveRequestType(type);
    setAnimatingStepIdx(0);
    setIsPlaying(true);
    const firstStage = PIPELINE_STAGES.find((s) => s.id === 'client') || PIPELINE_STAGES[0];
    setSelectedStage(firstStage);
  };

  // Auto-play animation timer
  useEffect(() => {
    if (isPlaying && activeRequestType) {
      timerRef.current = setTimeout(() => {
        if (animatingStepIdx < activeTrace.length - 1) {
          const nextIdx = animatingStepIdx + 1;
          setAnimatingStepIdx(nextIdx);
          const nextStageId = activeTrace[nextIdx].stageId;
          const found = PIPELINE_STAGES.find((s) => s.id === nextStageId);
          if (found) setSelectedStage(found);
        } else {
          // Finished trace
          setIsPlaying(false);
        }
      }, 2500);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, animatingStepIdx, activeRequestType, activeTrace]);

  const stepNext = () => {
    if (animatingStepIdx < activeTrace.length - 1) {
      const nextIdx = animatingStepIdx + 1;
      setAnimatingStepIdx(nextIdx);
      const nextStageId = activeTrace[nextIdx].stageId;
      const found = PIPELINE_STAGES.find((s) => s.id === nextStageId);
      if (found) setSelectedStage(found);
    }
  };

  const stepPrev = () => {
    if (animatingStepIdx > 0) {
      const prevIdx = animatingStepIdx - 1;
      setAnimatingStepIdx(prevIdx);
      const prevStageId = activeTrace[prevIdx].stageId;
      const found = PIPELINE_STAGES.find((s) => s.id === prevStageId);
      if (found) setSelectedStage(found);
    }
  };

  const stopAnimation = () => {
    setIsPlaying(false);
    setActiveRequestType(null);
    setAnimatingStepIdx(0);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner / Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20">
              Interactive Systems Tour
            </span>
            <span className="text-xs text-slate-400">Step 13 • Learn Section</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1 flex items-center gap-2">
            <Server className="h-6 w-6 text-red-500" />
            C++20 In-Memory Engine Architecture
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Explore how data flows through the Linux epoll reactor, RESP parser, keyspace dictionaries, and durability subsystems.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl bg-slate-900 border border-slate-700/80 p-1 shadow-lg">
            <button
              onClick={() => startRequestTrace('SET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeRequestType === 'SET'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Follow a SET Request
            </button>
            <button
              onClick={() => startRequestTrace('GET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeRequestType === 'GET'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="h-3.5 w-3.5 text-sky-400" />
              Follow a GET Request
            </button>
          </div>

          {activeRequestType && (
            <button
              onClick={stopAnimation}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              Exit Trace
            </button>
          )}
        </div>
      </div>

      {/* Animation Player Narration Bar (Active during Follow Request) */}
      {activeRequestType && currentTraceStep && (
        <div className="bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-red-500/20 text-red-400 border border-red-500/30">
                Step {animatingStepIdx + 1} of {activeTrace.length}
              </span>
              <span className="text-xs font-semibold text-white">{currentTraceStep.title}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              {currentTraceStep.narration}
            </p>
            {currentTraceStep.wireBytes && (
              <div className="text-[11px] font-mono text-emerald-400 bg-slate-950/80 px-2 py-1 rounded inline-block border border-slate-800 mt-1">
                Wire: <span className="text-slate-200">{currentTraceStep.wireBytes}</span>
              </div>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center gap-1.5 self-end md:self-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={stepPrev}
              disabled={animatingStepIdx === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition"
              title="Previous Step"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition shadow"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={stepNext}
              disabled={animatingStepIdx === activeTrace.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition"
              title="Next Step"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: SVG Pipeline Diagram (Left/Center) + Deep Inspection Side Panel (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* SVG Interactive Pipeline */}
        <div className="xl:col-span-8 space-y-4">
          <ArchitecturePipelineSvg
            selectedStageId={selectedStage.id}
            onSelectStage={handleSelectStage}
            animatingStageId={activeRequestType ? currentTraceStep?.stageId : null}
            activeRequestType={activeRequestType}
            liveStats={{
              connected_clients: metrics.connected_clients,
              instantaneous_ops_per_sec: metrics.instantaneous_ops_per_sec,
              total_commands_processed: metrics.total_commands_processed,
              db0_keys: metrics.db0_keys || metrics.total_keys || 8,
              expired_keys: metrics.expired_keys,
              used_memory_human: metrics.used_memory_human,
            }}
          />

          {/* Quick Stage Pill Navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
            {PIPELINE_STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectStage(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 border ${
                  selectedStage.id === s.id
                    ? 'bg-slate-800 text-white border-blue-500/50 shadow-md'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-mono font-bold">
                  {s.number}
                </span>
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Side Panel: Stage Details, Plain English & Live Telemetry */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            {/* Header */}
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                  Stage {selectedStage.number} of 9
                </span>
                <span className="text-xs text-slate-400 capitalize">{selectedStage.category} subsystem</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1.5">{selectedStage.title}</h2>
              <p className="text-xs text-slate-400">{selectedStage.subtitle}</p>
            </div>

            {/* 1. What it does in plain English */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                What It Does in Plain English
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                {selectedStage.whatItDoes}
              </p>
            </div>

            {/* 2. Why it exists */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-amber-400" />
                Why It Exists
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                {selectedStage.whyItExists}
              </p>
            </div>

            {/* 3. Tiny Example / Wire Format */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Code className="h-3.5 w-3.5 text-emerald-400" />
                {selectedStage.exampleTitle}
              </h3>
              <pre className="text-[11px] font-mono text-slate-200 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto leading-relaxed">
                <code>{selectedStage.exampleSnippet}</code>
              </pre>
            </div>

            {/* 4. Live Server Numbers */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-red-400" />
                Live Server Telemetry
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {selectedStage.liveMetricFields.map((field) => {
                  const rawVal = metrics[field.key];
                  const displayVal =
                    rawVal !== undefined
                      ? field.formatter
                        ? field.formatter(rawVal)
                        : String(rawVal)
                      : field.fallback || 'N/A';

                  return (
                    <div
                      key={field.key}
                      className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex flex-col justify-between"
                    >
                      <span className="text-[10px] text-slate-400 font-medium">{field.label}</span>
                      <span className="text-sm font-bold font-mono text-sky-400 mt-1">
                        {displayVal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
