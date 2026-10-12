import React, { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, AlertTriangle, Trash2, KeyRound } from 'lucide-react';
import {
  AclUserItem,
  AclCategoryInfo,
  AclRuleObject,
  AclTestResult,
  SecurityStatus,
} from '../features/security/types';
import { SecurityStatusCards } from '../features/security/SecurityStatusCards';
import { AclUsersTable } from '../features/security/AclUsersTable';
import { AclRuleBuilderModal } from '../features/security/AclRuleBuilderModal';
import { AclTestPanel } from '../features/security/AclTestPanel';

export const SecurityPage: React.FC = () => {
  const [users, setUsers] = useState<AclUserItem[]>([]);
  const [categories, setCategories] = useState<AclCategoryInfo[]>([]);
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [editingUser, setEditingUser] = useState<AclUserItem | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);

  const fetchSecurityData = useCallback(async () => {
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [usersRes, catsRes, statusRes] = await Promise.all([
        fetch('/api/acl/users', { headers }),
        fetch('/api/acl/categories', { headers }),
        fetch('/api/security/status', { headers }),
      ]);

      if (usersRes.ok) {
        const u = await usersRes.json();
        setUsers(u || []);
      }
      if (catsRes.ok) {
        const c = await catsRes.json();
        setCategories(c || []);
      }
      if (statusRes.ok) {
        const s = await statusRes.json();
        setStatus(s);
      }
      setError(null);
    } catch (err: any) {
      console.error('Error fetching security info:', err);
      setError(err.message || 'Network error fetching security telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  const handleSaveUser = async (rule: AclRuleObject) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/acl/users', {
      method: 'POST',
      headers,
      body: JSON.stringify(rule),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update ACL user');
    }

    await fetchSecurityData();
  };

  const handleDeleteUser = async (username: string) => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/acl/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to delete ACL user');
    } else {
      setDeletingUsername(null);
      await fetchSecurityData();
    }
  };

  const handleTestAcl = async (user: string, command: string): Promise<AclTestResult> => {
    const token = localStorage.getItem('redisx_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/acl/test', {
      method: 'POST',
      headers,
      body: JSON.stringify({ user, command }),
    });

    return res.json();
  };

  if (loading && !status) {
    return (
      <div className="flex-1 p-8 bg-[#070b14] text-slate-100 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
          <span>Verifying security policies...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 bg-[#070b14] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Security & Access Control (ACL)</h1>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
                {users.length} accounts configured
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manage client authentication, granular command permissions, and key pattern boundaries
            </p>
          </div>
        </div>

        <button
          onClick={fetchSecurityData}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Security Overview Cards */}
      {status && <SecurityStatusCards status={status} />}

      {/* 2. ACL Users Table */}
      <AclUsersTable
        users={users}
        onEditUser={(u) => {
          setEditingUser(u);
          setIsBuilderOpen(true);
        }}
        onDeleteUser={(name) => setDeletingUsername(name)}
        onCreateUser={() => {
          setEditingUser(null);
          setIsBuilderOpen(true);
        }}
      />

      {/* 3. Interactive ACL Test Simulator */}
      {users.length > 0 && <AclTestPanel users={users} onTest={handleTestAcl} />}

      {/* Rule Builder Modal */}
      <AclRuleBuilderModal
        user={editingUser}
        isOpen={isBuilderOpen}
        onClose={() => {
          setIsBuilderOpen(false);
          setEditingUser(null);
        }}
        onSave={handleSaveUser}
        categories={categories}
      />

      {/* Delete User Confirm Dialog */}
      {deletingUsername && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0d1322] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 border border-red-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete ACL Account</h3>
                <p className="text-xs text-slate-400">ACL DELUSER {deletingUsername}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Are you sure you want to permanently delete user <strong className="text-white font-mono">{deletingUsername}</strong>? Any client connections currently authenticated with this user may be severed or unable to execute further commands.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingUsername(null)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUser(deletingUsername)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Yes, Delete User</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
