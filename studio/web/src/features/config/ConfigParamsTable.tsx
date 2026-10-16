import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Search,
  Filter,
  Check,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Lock,
  Download,
} from 'lucide-react';
import { ConfigParamItem } from './types';
import { InfoTip } from '../../components/InfoTip';

interface ConfigParamsTableProps {
  params: ConfigParamItem[];
  onTriggerEdit: (param: ConfigParamItem, newValue: any) => void;
  onOpenExport: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const ConfigParamsTable: React.FC<ConfigParamsTableProps> = ({
  params,
  onTriggerEdit,
  onOpenExport,
}) => {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [onlyChanged, setOnlyChanged] = useState(false);

  // Local draft values for inline edits
  const [draftValues, setDraftValues] = useState<Record<string, any>>({});

  const GROUPS = useMemo(() => {
    const set = new Set<string>();
    params.forEach((p) => {
      if (p.group) set.add(p.group);
    });
    return ['All', ...Array.from(set).sort()];
  }, [params]);

  const filteredParams = useMemo(() => {
    const q = search.toLowerCase().trim();
    return params.filter((p) => {
      if (selectedGroup !== 'All' && p.group !== selectedGroup) return false;
      if (onlyChanged && !p.isChangedFromDefault) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.group && p.group.toLowerCase().includes(q))
      );
    });
  }, [params, selectedGroup, onlyChanged, search]);

  const handleDraftChange = (paramName: string, val: any) => {
    setDraftValues((prev) => ({ ...prev, [paramName]: val }));
  };

  const getEffectiveValue = (p: ConfigParamItem) => {
    return draftValues[p.name] !== undefined ? draftValues[p.name] : p.currentValue;
  };

  const isDirty = (p: ConfigParamItem) => {
    return draftValues[p.name] !== undefined && draftValues[p.name] !== p.currentValue;
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">Runtime Server Parameters</h3>
          <InfoTip content="Parameters loaded from CONFIG GET * and mapped against server schema. Mutable parameters can be updated live using CONFIG SET without server restart." />
        </div>

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-xs"
        >
          <Download className="h-3.5 w-3.5 text-sky-400" />
          <span>Export redis.conf</span>
        </button>
      </div>

      {/* Controls: Groups, Search, Changed-only toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Group tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                selectedGroup === g
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Right filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Changed toggle */}
          <button
            onClick={() => setOnlyChanged(!onlyChanged)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              onlyChanged
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            <span>Changed from default</span>
          </button>

          {/* Search bar */}
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search parameter..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono placeholder:text-slate-600 focus:outline-hidden focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Parameters Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Parameter</th>
              <th className="py-3 px-4">Group</th>
              <th className="py-3 px-4">Current Value</th>
              <th className="py-3 px-4">Default</th>
              <th className="py-3 px-4">Runtime Mutability</th>
              <th className="py-3 px-4 text-right">Apply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredParams.map((p) => {
              const dirty = isDirty(p);
              const val = getEffectiveValue(p);

              return (
                <tr key={p.name} className="hover:bg-slate-900/40 transition-colors">
                  {/* Parameter name & description */}
                  <td className="py-3 px-4 max-w-[240px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{p.name}</span>
                      {p.isChangedFromDefault && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-400"
                          title="Modified from default value"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5 line-clamp-1" title={p.description}>
                      {p.description}
                    </div>
                  </td>

                  {/* Group badge */}
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-400">
                      {p.group}
                    </span>
                  </td>

                  {/* Current / Draft Value with inline editor by type */}
                  <td className="py-3 px-4">
                    {/* Boolean Switch */}
                    {p.type === 'boolean' && (
                      <button
                        type="button"
                        onClick={() => handleDraftChange(p.name, !val)}
                        disabled={!p.mutableAtRuntime}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                          val
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        } ${!p.mutableAtRuntime ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {val ? 'yes (true)' : 'no (false)'}
                      </button>
                    )}

                    {/* Enum Select */}
                    {p.type === 'enum' && p.enumOptions && (
                      <select
                        value={String(val)}
                        onChange={(e) => handleDraftChange(p.name, e.target.value)}
                        disabled={!p.mutableAtRuntime}
                        className="px-2 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-sky-300 font-mono disabled:opacity-50 focus:border-sky-500 focus:outline-hidden"
                      >
                        {p.enumOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Number / Bytes / String input */}
                    {p.type !== 'boolean' && p.type !== 'enum' && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type={p.type === 'integer' || p.type === 'bytes' ? 'number' : 'text'}
                          value={p.name === 'requirepass' && !dirty && p.currentValue ? '********' : val ?? ''}
                          onChange={(e) => handleDraftChange(p.name, e.target.value)}
                          disabled={!p.mutableAtRuntime}
                          placeholder={p.name === 'requirepass' ? 'Empty (no password)' : ''}
                          className="w-36 px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono disabled:opacity-50 focus:border-sky-500 focus:outline-hidden"
                        />
                        {p.unit && <span className="text-[11px] text-slate-500 font-mono">{p.unit}</span>}
                      </div>
                    )}
                  </td>

                  {/* Default value */}
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {p.type === 'bytes' && typeof p.default === 'number'
                      ? formatBytes(p.default)
                      : String(p.default === '' ? 'empty' : p.default)}
                  </td>

                  {/* Mutability */}
                  <td className="py-3 px-4">
                    {p.mutableAtRuntime ? (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        LIVE RECONFIG
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        REQUIRES RESTART
                      </span>
                    )}
                  </td>

                  {/* Action apply button */}
                  <td className="py-3 px-4 text-right">
                    {dirty ? (
                      <button
                        onClick={() => onTriggerEdit(p, val)}
                        className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-sans text-xs font-semibold shadow-xs transition-colors"
                      >
                        Save
                      </button>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
