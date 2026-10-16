import React from 'react';
import {
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Shield,
  Layers,
} from 'lucide-react';
import { AclUserItem } from './types';
import { InfoTip } from '../../components/InfoTip';

interface AclUsersTableProps {
  users: AclUserItem[];
  onEditUser: (user: AclUserItem) => void;
  onDeleteUser: (username: string) => void;
  onCreateUser: () => void;
}

export const AclUsersTable: React.FC<AclUsersTableProps> = ({
  users,
  onEditUser,
  onDeleteUser,
  onCreateUser,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">ACL User Accounts & Permissions</h3>
          <InfoTip content="Redis Access Control Lists (ACL) govern which commands and key patterns authenticated connections are permitted to execute." />
        </div>

        <button
          onClick={onCreateUser}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-xs"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>Create ACL User</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Authentication</th>
              <th className="py-3 px-4">Allowed Keys</th>
              <th className="py-3 px-4">Command Permissions</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {users.map((u) => (
              <tr key={u.username} className="hover:bg-slate-900/40 transition-colors">
                {/* Username */}
                <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                  <span>{u.username}</span>
                  {u.isDefault && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                      DEFAULT
                    </span>
                  )}
                </td>

                {/* Status */}
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      u.enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {u.enabled ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> ON
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" /> OFF
                      </>
                    )}
                  </span>
                </td>

                {/* Authentication state */}
                <td className="py-3 px-4 text-slate-300">
                  {u.isNoPass ? (
                    <span className="text-amber-400 font-semibold text-[11px]">No password (nopass)</span>
                  ) : u.hasPassword ? (
                    <span className="flex items-center gap-1 text-slate-300 text-[11px]">
                      <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                      {u.passwordCount} Password Hash{u.passwordCount > 1 ? 'es' : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">No credentials</span>
                  )}
                </td>

                {/* Keyspace */}
                <td className="py-3 px-4 text-slate-300 max-w-[180px] truncate" title={u.keysSummary}>
                  {u.keysSummary}
                </td>

                {/* Command Permissions summary */}
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1 max-w-[260px]">
                    {u.allowedCategories.map((c) => (
                      <span
                        key={c}
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      >
                        +@{c}
                      </span>
                    ))}
                    {u.deniedCategories.map((c) => (
                      <span
                        key={c}
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20"
                      >
                        -@{c}
                      </span>
                    ))}
                    {u.allowedCommands.map((cmd) => (
                      <span
                        key={cmd}
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20"
                      >
                        +{cmd}
                      </span>
                    ))}
                    {u.deniedCommands.map((cmd) => (
                      <span
                        key={cmd}
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20"
                      >
                        -{cmd}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onEditUser(u)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit ACL Rule"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {!u.isDefault && (
                      <button
                        onClick={() => onDeleteUser(u.username)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-200 hover:bg-red-500/10 transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
