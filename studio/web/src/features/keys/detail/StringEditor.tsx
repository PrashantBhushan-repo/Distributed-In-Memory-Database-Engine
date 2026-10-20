import React, { useState, useEffect, useMemo } from 'react';
import { Save, RotateCcw, AlertCircle, FileText, Code2, Binary, ShieldAlert } from 'lucide-react';
import { KeyDetail, KeyFormatHint } from '../types';
import { CommandChip } from '../../../components/CommandChip';

interface StringEditorProps {
  detail: KeyDetail;
  isViewer?: boolean;
  onSave: (newValue: string, command: string) => Promise<void>;
}

export const StringEditor: React.FC<StringEditorProps> = ({
  detail,
  isViewer = false,
  onSave,
}) => {
  const originalValue = detail.value ?? '';
  const [currentValue, setCurrentValue] = useState(originalValue);
  const [activeTab, setActiveTab] = useState<KeyFormatHint>(detail.formatHint || 'text');
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentValue(detail.value ?? '');
    if (detail.formatHint) {
      setActiveTab(detail.formatHint);
    }
  }, [detail.value, detail.formatHint, detail.name]);

  const isDirty = currentValue !== originalValue;

  // Pretty JSON formatter
  const formattedJson = useMemo(() => {
    try {
      const parsed = JSON.parse(currentValue);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return null;
    }
  }, [currentValue]);

  // Hex representation
  const hexValue = useMemo(() => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(currentValue);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }, [currentValue]);

  // Base64 representation
  const base64Value = useMemo(() => {
    try {
      return btoa(currentValue);
    } catch {
      return 'Non-ASCII characters cannot be encoded via window.btoa';
    }
  }, [currentValue]);

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    try {
      JSON.parse(text);
      setJsonError(null);
      setCurrentValue(text);
    } catch (err: any) {
      setJsonError(err.message);
      setCurrentValue(text);
    }
  };

  const handleSave = async () => {
    if (isViewer || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/key/${encodeURIComponent(detail.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: currentValue, keepTtl: true }),
      });
      const data = await res.json();
      if (res.ok) {
        await onSave(currentValue, data.command || `SET ${detail.name} "${currentValue}"`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setCurrentValue(originalValue);
    setJsonError(null);
  };

  return (
    <div className="space-y-4">
      {/* Format Tabs & Dirty State Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'text'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Raw Text</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'json'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="h-3.5 w-3.5 text-amber-400" />
            <span>JSON Pretty</span>
          </button>
          <button
            onClick={() => setActiveTab('hex')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'hex'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Binary className="h-3.5 w-3.5 text-blue-400" />
            <span>Hex</span>
          </button>
          <button
            onClick={() => setActiveTab('base64')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'base64'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Base64</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
          )}

          {isDirty && (
            <button
              onClick={handleRevert}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 text-xs font-semibold flex items-center gap-1"
              title="Revert to server value"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Revert</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!isDirty || saving || isViewer}
            title={isViewer ? 'Viewer accounts have read-only access' : 'Save changes to Redis'}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {isViewer && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Viewer mode active: Read-only access. Editor mutations are disabled.</span>
        </div>
      )}

      {/* Editor Content based on Active Tab */}
      <div className="relative">
        {activeTab === 'text' && (
          <textarea
            value={currentValue}
            onChange={(e) => !isViewer && setCurrentValue(e.target.value)}
            disabled={isViewer}
            rows={12}
            className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:border-red-500/50 resize-y selection:bg-red-500/30 disabled:opacity-80"
            placeholder="Key string value..."
          />
        )}

        {activeTab === 'json' && (
          <div className="space-y-2">
            <textarea
              value={formattedJson !== null ? formattedJson : currentValue}
              onChange={handleJsonChange}
              disabled={isViewer}
              rows={12}
              className={`w-full p-4 rounded-xl bg-slate-950 border font-mono text-xs leading-relaxed focus:outline-none resize-y selection:bg-red-500/30 disabled:opacity-80 ${
                jsonError ? 'border-red-500 text-red-300' : 'border-slate-800 text-slate-100 focus:border-amber-500/50'
              }`}
              placeholder="Valid JSON value..."
            />
            {jsonError && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>JSON Syntax Warning: {jsonError}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hex' && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-blue-300 leading-relaxed overflow-x-auto select-all max-h-72">
            {hexValue || '<empty>'}
          </div>
        )}

        {activeTab === 'base64' && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto select-all max-h-72">
            {base64Value || '<empty>'}
          </div>
        )}
      </div>

      {/* Raw CLI command preview */}
      <div className="space-y-1.5 pt-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Equivalent RESP Command
        </span>
        <CommandChip command={`SET ${detail.name} "${currentValue}"`} />
      </div>
    </div>
  );
};
