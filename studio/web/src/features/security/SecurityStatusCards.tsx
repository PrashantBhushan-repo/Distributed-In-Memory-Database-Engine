import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Radio,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { SecurityStatus } from './types';
import { InfoTip } from '../../components/InfoTip';

interface SecurityStatusCardsProps {
  status: SecurityStatus;
}

export const SecurityStatusCards: React.FC<SecurityStatusCardsProps> = ({ status }) => {
  return (
    <div className="space-y-4">
      {/* 3 Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. AUTH Required Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status.authRequired ? (
                  <Lock className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Unlock className="h-4 w-4 text-amber-400" />
                )}
                <h3 className="text-sm font-semibold text-white">Client Authentication</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  status.authRequired
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {status.authRequired ? 'AUTH REQUIRED' : 'NO AUTH REQUIRED'}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              {status.authRequired
                ? 'Client connections must authenticate using AUTH or named ACL credentials before issuing keyspace operations.'
                : 'Server allows unauthenticated commands from the default user. Anyone with network access can query Redis.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
            Mode: {status.authRequired ? 'requirepass / ACL protected' : 'nopass active'}
          </div>
        </div>

        {/* 2. TLS Encryption Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className={`h-4 w-4 ${status.tlsEnabled ? 'text-emerald-400' : 'text-sky-400'}`} />
                <h3 className="text-sm font-semibold text-white">Transport Security (TLS)</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  status.tlsEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {status.tlsEnabled ? 'TLS ENCRYPTED' : 'PLAINTEXT TCP'}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              {status.tlsEnabled
                ? 'All TCP connections between clients, replication nodes, and the gateway are encrypted using TLS/SSL.'
                : 'Traffic traverses local loopback or internal subnet in plaintext TCP. TLS is recommended for public/cross-VPC links.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
            Protocol: {status.tlsEnabled ? 'TLSv1.3' : 'Raw TCP Socket'}
          </div>
        </div>

        {/* 3. Default User Posture Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status.defaultUserState.hasPassword && !status.defaultUserState.isDangerousAllowed ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                )}
                <h3 className="text-sm font-semibold text-white">Default User Posture</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  status.defaultUserState.hasPassword && !status.defaultUserState.isDangerousAllowed
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {status.defaultUserState.hasPassword && !status.defaultUserState.isDangerousAllowed
                  ? 'HARDENED'
                  : 'PERMISSIVE'}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              {status.defaultUserState.summary}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
            {status.defaultUserState.isDangerousAllowed ? 'Danger: +@all enabled' : 'Safe: restricted categories'}
          </div>
        </div>
      </div>

      {/* Security Recommendations Banner */}
      {status.recommendations.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Security Recommendations
              </h4>
              <ul className="text-xs text-slate-300 space-y-1 mt-1">
                {status.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-amber-400" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
