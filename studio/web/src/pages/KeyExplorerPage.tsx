import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
  Clock,
  HardDrive,
  Check,
  Copy,
  Terminal,
  Database,
  StopCircle,
  Play,
  Layers,
  ArrowRight,
  Sparkles,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Shield,
} from 'lucide-react';
import { KeyItem, KeyTreeNode, TypeFilter, TtlFilter, ViewMode } from '../features/keys/types';
import { middleEllipsis, formatTtl, formatBytes, getTypeBadgeConfig } from '../features/keys/formatters';
import { InfoTip } from '../components/InfoTip';
import { CommandChip } from '../components/CommandChip';
import { registerPaletteItems } from '../components/CommandPalette';
import { KeyDetailPanel } from '../features/keys/detail/KeyDetailPanel';
import { CreateKeyWizard } from '../features/keys/CreateKeyWizard';
import { BulkDeleteModal } from '../features/keys/BulkDeleteModal';

export const KeyExplorerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKeyParam = searchParams.get('key');

  // Keys state
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [totalApprox, setTotalApprox] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk Selection & Modals state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isViewer, setIsViewer] = useState(false);

  // Tree state
  const [treeNodes, setTreeNodes] = useState<KeyTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [treeLoading, setTreeLoading] = useState(false);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [ttlFilter, setTtlFilter] = useState<TtlFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Selected key item
  const selectedKey = useMemo(() => {
    return keys.find((k) => k.name === selectedKeyParam) || (selectedKeyParam ? {
      name: selectedKeyParam,
      type: 'string',
      ttl: -1,
      ttlMs: -1,
      encoding: 'raw',
      size: 1,
      memoryBytes: 64,
    } as KeyItem : null);
  }, [keys, selectedKeyParam]);

  // Debounce search query input (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Initial fetch and on filter/query reset
  const fetchKeysInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const match = debouncedQuery ? (debouncedQuery.includes('*') ? debouncedQuery : `*${debouncedQuery}*`) : '*';
      const typeParam = typeFilter !== 'all' ? `&type=${typeFilter}` : '';
      const res = await fetch(`/api/keys?cursor=0&match=${encodeURIComponent(match)}&count=100${typeParam}`);
      if (!res.ok) throw new Error('Failed to scan keys from gateway');
      const data = await res.json();
      setKeys(data.keys || []);
      setCursor(data.cursor || 0);
      setTotalApprox(data.totalApprox || (data.keys ? data.keys.length : 0));
    } catch (err: any) {
      setError(err.message || 'Error scanning keys');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, typeFilter]);

  // Fetch Tree view data
  const fetchTreeData = useCallback(async () => {
    setTreeLoading(true);
    try {
      const prefix = debouncedQuery ? debouncedQuery.replace(/\*$/, '') : '';
      const res = await fetch(`/api/keys/tree?prefix=${encodeURIComponent(prefix)}&delimiter=:`);
      if (res.ok) {
        const data = await res.json();
        setTreeNodes(data.nodes || []);
      }
    } catch {
      // ignore
    } finally {
      setTreeLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchKeysInitial();
    } else {
      fetchTreeData();
    }
  }, [fetchKeysInitial, fetchTreeData, viewMode]);

  // Incremental next SCAN fetch (infinite scroll)
  const fetchNextScan = useCallback(async () => {
    if (cursor === 0 || loading) return;
    setLoading(true);
    try {
      const match = debouncedQuery ? (debouncedQuery.includes('*') ? debouncedQuery : `*${debouncedQuery}*`) : '*';
      const typeParam = typeFilter !== 'all' ? `&type=${typeFilter}` : '';
      const res = await fetch(`/api/keys?cursor=${cursor}&match=${encodeURIComponent(match)}&count=100${typeParam}`);
      if (res.ok) {
        const data = await res.json();
        setKeys((prev) => {
          const existingNames = new Set(prev.map((k) => k.name));
          const newKeys = (data.keys || []).filter((k: KeyItem) => !existingNames.has(k.name));
          return [...prev, ...newKeys];
        });
        setCursor(data.cursor || 0);
        if (data.totalApprox) setTotalApprox(data.totalApprox);
      }
    } catch {
      // Keep existing keys
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, debouncedQuery, typeFilter]);

  // Background auto-scan loop until cursor hits 0 or stopped
  useEffect(() => {
    let cancel = false;
    const runAutoScan = async () => {
      if (!isScanningActive || cursor === 0) {
        setIsScanningActive(false);
        return;
      }
      await fetchNextScan();
      if (!cancel && isScanningActive && cursor !== 0) {
        setTimeout(runAutoScan, 200);
      }
    };

    if (isScanningActive) {
      runAutoScan();
    }

    return () => {
      cancel = true;
    };
  }, [isScanningActive, cursor, fetchNextScan]);

  // Register loaded keys into the global command palette (Cmd+K)
  useEffect(() => {
    if (keys.length === 0) return;
    const paletteItems = keys.slice(0, 50).map((k) => ({
      id: `key:${k.name}`,
      title: k.name,
      description: `${k.type.toUpperCase()} · ${k.ttl > 0 ? `${k.ttl}s TTL` : 'persist'} · ${formatBytes(k.memoryBytes)}`,
      path: `/keys?key=${encodeURIComponent(k.name)}`,
      category: 'Data' as const,
      icon: getTypeBadgeConfig(k.type).icon,
    }));
    const unregister = registerPaletteItems(paletteItems);
    return unregister;
  }, [keys]);

  // Client-side filtering for TTL states
  const filteredKeys = useMemo(() => {
    return keys.filter((k) => {
      if (ttlFilter === 'has_ttl') return k.ttl > 0;
      if (ttlFilter === 'no_ttl') return k.ttl === -1;
      if (ttlFilter === 'expiring_1m') return k.ttl > 0 && k.ttl <= 60;
      return true;
    });
  }, [keys, ttlFilter]);

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredKeys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  // Handle scroll reaching near bottom to auto-fetch next cursor
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (
      target.scrollHeight - target.scrollTop <= target.clientHeight + 150 &&
      cursor !== 0 &&
      !loading &&
      !isScanningActive
    ) {
      fetchNextScan();
    }
  };

  const handleSelectKey = (keyName: string) => {
    setSearchParams({ key: keyName });
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const toggleKeySelection = (keyName: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName);
      else next.add(keyName);
      return next;
    });
  };

  const allSelected = filteredKeys.length > 0 && filteredKeys.every((k) => selectedKeys.has(k.name));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredKeys.map((k) => k.name)));
    }
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
      {/* ─────────────────────────────────────────────────────────────
          TOOLBAR: Pattern search, filters, view toggle, progress
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-3 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Pattern Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search pattern (e.g. user:*, session:*)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-white text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Action Tools: SCAN progress & View Mode Switcher */}
          <div className="flex items-center gap-3">
            {/* SCAN Progress Indicator with InfoTip */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300">
              <span className="text-slate-500 flex items-center gap-1">
                <span>SCAN:</span>
                <InfoTip term="pipelining" />
              </span>
              <span className="text-white font-bold">{keys.length.toLocaleString()}</span>
              {totalApprox > 0 && (
                <span className="text-slate-500">of ~{totalApprox.toLocaleString()}</span>
              )}

              {cursor !== 0 && (
                <button
                  onClick={() => setIsScanningActive(!isScanningActive)}
                  className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition ${
                    isScanningActive
                      ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  }`}
                  title={isScanningActive ? 'Pause background scan' : 'Scan all remaining keys'}
                >
                  {isScanningActive ? <StopCircle className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  <span>{isScanningActive ? 'Stop' : 'Scan All'}</span>
                </button>
              )}
            </div>

            {/* View Mode Toggle: List vs Tree */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-red-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>List</span>
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 ${
                  viewMode === 'tree'
                    ? 'bg-red-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Tree</span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => (viewMode === 'list' ? fetchKeysInitial() : fetchTreeData())}
              disabled={loading || treeLoading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh key listing"
            >
              <RefreshCw className={`h-4 w-4 ${loading || treeLoading ? 'animate-spin text-red-500' : ''}`} />
            </button>

            {/* + New Key Button */}
            <button
              onClick={() => !isViewer && setCreateWizardOpen(true)}
              disabled={isViewer}
              title={isViewer ? 'Viewer accounts have read-only access' : 'Create a new key'}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Key</span>
            </button>
          </div>
        </div>

        {/* Filter Pills: Type and TTL */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
          {/* Type Filter */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <span className="text-[11px] text-slate-500 uppercase font-semibold mr-1">Type:</span>
            {(['all', 'string', 'hash', 'list', 'set', 'zset'] as TypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-bold transition ${
                  typeFilter === t
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* TTL Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500 uppercase font-semibold mr-1">TTL:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'has_ttl', label: 'Has TTL' },
              { id: 'no_ttl', label: 'No TTL' },
              { id: 'expiring_1m', label: '< 1m' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTtlFilter(f.id as TtlFilter)}
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold transition ${
                  ttlFilter === f.id
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SPLIT-PANE LAYOUT: Key List on Left, Detail Placeholder on Right
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* LEFT PANE: Virtualized List or Tree View */}
        <div className="w-1/2 flex flex-col bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
          {viewMode === 'list' ? (
            /* 1. Virtualized List View */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header row with Select All checkbox */}
              {filteredKeys.length > 0 && (
                <div className="px-3.5 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-white flex items-center gap-1.5 font-bold transition"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-4 w-4 text-red-500" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      <span>Select All</span>
                    </button>
                    {selectedKeys.size > 0 && (
                      <span className="text-red-400 font-bold">({selectedKeys.size} selected)</span>
                    )}
                  </div>
                  <span className="text-slate-500">{filteredKeys.length} keys</span>
                </div>
              )}

              <div
                ref={parentRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto divide-y divide-slate-800/60"
              >
                {loading && keys.length === 0 ? (
                  /* Skeleton Loading Rows */
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-10 bg-slate-900/50 rounded-lg animate-pulse border border-slate-800/40" />
                    ))}
                  </div>
                ) : error ? (
                  /* Error State with Retry */
                  <div className="p-8 text-center space-y-3">
                    <div className="text-rose-400 text-xs font-mono">{error}</div>
                    <button
                      onClick={fetchKeysInitial}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Retry Scan
                    </button>
                  </div>
                ) : filteredKeys.length === 0 ? (
                  /* Empty State */
                  <div className="p-12 text-center space-y-3 text-slate-500">
                    <Database className="h-8 w-8 mx-auto text-slate-600" />
                    <div className="text-xs font-semibold text-slate-400">No matching keys found</div>
                    <p className="text-[11px] max-w-xs mx-auto text-slate-500">
                      Try adjusting your search query, clearing filters, or seeding the sample dataset.
                    </p>
                  </div>
                ) : (
                  /* Virtualized Rows Container */
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = filteredKeys[virtualRow.index];
                      const badge = getTypeBadgeConfig(item.type);
                      const ttlInfo = formatTtl(item.ttl);
                      const isSelected = selectedKeyParam === item.name;
                      const isChecked = selectedKeys.has(item.name);

                      return (
                        <div
                          key={item.name}
                          onClick={() => handleSelectKey(item.name)}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className={`px-3.5 flex items-center justify-between cursor-pointer transition select-none ${
                            isSelected
                              ? 'bg-red-500/10 border-l-2 border-red-500 text-white'
                              : 'hover:bg-slate-800/30 text-slate-300'
                          }`}
                        >
                          {/* Left: Checkbox + Badge + Name */}
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleKeySelection(item.name);
                              }}
                              className="text-slate-500 hover:text-slate-200 transition"
                            >
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-red-500" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>

                            <span
                              className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border shrink-0 ${badge.badgeClass}`}
                            >
                              {badge.icon}
                              <span>{badge.label}</span>
                            </span>

                            <span
                              className="font-mono text-xs truncate"
                              title={item.name}
                            >
                              {middleEllipsis(item.name, 36)}
                            </span>
                          </div>

                          {/* Right: TTL chip + Size */}
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                ttlInfo.isPersist
                                  ? 'bg-slate-900 text-slate-500 border-slate-800'
                                  : ttlInfo.isExpiringSoon
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 font-bold'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}
                            >
                              {ttlInfo.text}
                            </span>

                            <span className="text-[10px] font-mono text-slate-500 w-12 text-right">
                              {formatBytes(item.memoryBytes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 2. Hierarchical Tree View */
            <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
              {treeLoading ? (
                <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-red-500" />
                  <span>Loading namespace tree...</span>
                </div>
              ) : treeNodes.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">No keys matching tree prefix.</div>
              ) : (
                treeNodes.map((node) => {
                  const isExpanded = expandedFolders.has(node.fullPath);

                  if (node.isLeaf) {
                    const badge = getTypeBadgeConfig(node.type);
                    const isSelected = selectedKeyParam === node.fullPath;
                    const isChecked = selectedKeys.has(node.fullPath);
                    return (
                      <div
                        key={node.fullPath}
                        onClick={() => handleSelectKey(node.fullPath)}
                        className={`pl-6 py-1.5 px-2 rounded-lg flex items-center justify-between cursor-pointer transition ${
                          isSelected ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleKeySelection(node.fullPath);
                            }}
                            className="text-slate-500 hover:text-slate-200 transition"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {badge.icon}
                          <span className="truncate">{node.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{formatBytes(node.memoryBytes)}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={node.fullPath} className="space-y-0.5">
                      <div
                        onClick={() => toggleFolder(node.fullPath)}
                        className="py-1.5 px-2 rounded-lg flex items-center justify-between cursor-pointer hover:bg-slate-800/50 text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                          )}
                          {isExpanded ? (
                            <FolderOpen className="h-4 w-4 text-amber-400" />
                          ) : (
                            <Folder className="h-4 w-4 text-amber-400" />
                          )}
                          <span className="font-bold">{node.name}</span>
                        </div>

                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {node.keyCount} keys
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANE: Detail Panel */}
        <div className="w-1/2 bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden flex flex-col">
          <KeyDetailPanel
            keyName={selectedKeyParam}
            isViewer={isViewer}
            onKeyDeleted={() => {
              fetchKeysInitial();
              setSearchParams({});
            }}
            onKeyUpdated={() => {
              fetchKeysInitial();
            }}
          />
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-8 left-1/4 -translate-x-1/2 z-30 bg-slate-900 border border-slate-750 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-white font-semibold">
            <CheckSquare className="h-4 w-4 text-red-500" />
            <span>{selectedKeys.size} keys selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedKeys(new Set())}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Clear
            </button>
            <button
              onClick={() => !isViewer && setBulkDeleteOpen(true)}
              disabled={isViewer}
              title={isViewer ? 'Viewer accounts have read-only access' : 'Delete selected keys'}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete {selectedKeys.size} Keys</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Key Wizard Modal */}
      <CreateKeyWizard
        isOpen={createWizardOpen}
        onClose={() => setCreateWizardOpen(false)}
        onKeyCreated={(newKeyName) => {
          fetchKeysInitial();
          handleSelectKey(newKeyName);
        }}
      />

      {/* Bulk Delete Confirmation Modal */}
      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        keys={Array.from(selectedKeys)}
        onClose={() => setBulkDeleteOpen(false)}
        onDeleted={() => {
          setSelectedKeys(new Set());
          fetchKeysInitial();
          if (selectedKeyParam && selectedKeys.has(selectedKeyParam)) {
            setSearchParams({});
          }
        }}
      />
    </div>
  );
};
