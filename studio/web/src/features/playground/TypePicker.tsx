import React from 'react';
import { PlaygroundDataType } from './types';
import { LESSONS_BY_TYPE, THRESHOLD_PUSH_SCRIPTS } from './lessons';
import {
  Type,
  List,
  Hash,
  Binary,
  Layers,
  Sparkles,
  Play,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface TypePickerProps {
  selectedType: PlaygroundDataType;
  onSelectType: (t: PlaygroundDataType) => void;
  onRunCommand: (cmd: string) => void;
  onPushPastThreshold: (type: PlaygroundDataType) => void;
  isPushingThreshold: boolean;
}

export const TypePicker: React.FC<TypePickerProps> = ({
  selectedType,
  onSelectType,
  onRunCommand,
  onPushPastThreshold,
  isPushingThreshold,
}) => {
  const types: Array<{ id: PlaygroundDataType; label: string; icon: React.ReactNode; defaultKey: string }> = [
    { id: 'string', label: 'String', icon: <Type className="w-4 h-4" />, defaultKey: 'play:str' },
    { id: 'list', label: 'List', icon: <List className="w-4 h-4" />, defaultKey: 'play:tasks' },
    { id: 'hash', label: 'Hash', icon: <Hash className="w-4 h-4" />, defaultKey: 'play:user:101' },
    { id: 'set', label: 'Set', icon: <Binary className="w-4 h-4" />, defaultKey: 'play:ports' },
    { id: 'zset', label: 'Sorted Set', icon: <Layers className="w-4 h-4" />, defaultKey: 'play:leaderboard' },
  ];

  const lessons = LESSONS_BY_TYPE[selectedType] || [];
  const pushScript = THRESHOLD_PUSH_SCRIPTS[selectedType];

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Type Tabs */}
      <div className="p-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectType(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedType === t.id
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Push Past Threshold Action Button */}
      {pushScript && pushScript.commands.length > 0 && (
        <div className="p-3 bg-gradient-to-r from-red-950/30 via-slate-900 to-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Interactive Experiment
            </span>
          </div>
          <p className="text-xs text-slate-300 font-semibold mb-2">{pushScript.title}</p>
          <button
            onClick={() => onPushPastThreshold(selectedType)}
            disabled={isPushingThreshold}
            className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-98 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isPushingThreshold ? 'Demonstrating Transition...' : '⚡ Push Past the Threshold'}
          </button>
        </div>
      )}

      {/* Curated Lessons List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Runnable Lessons ({lessons.length})
        </div>

        {lessons.map((lesson) => (
          <div
            key={lesson.id}
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 space-y-1.5 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">{lesson.title}</span>
              <button
                onClick={() => onRunCommand(lesson.command)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors"
              >
                <Play className="w-2.5 h-2.5 fill-current" /> Run
              </button>
            </div>

            <div className="p-1.5 rounded bg-slate-900 border border-slate-800/60 font-mono text-[11px] text-sky-300 break-all">
              {lesson.command}
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
              <strong>Teaches:</strong> {lesson.teaches}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
