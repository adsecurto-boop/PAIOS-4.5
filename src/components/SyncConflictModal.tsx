import React, { useState } from 'react';
import { Cloud, Laptop, ShieldAlert, X } from 'lucide-react';
import { PendingSyncConflict, resolvePendingSyncConflict } from '../firebase';

interface SyncConflictModalProps {
  conflict: PendingSyncConflict;
  userId: string;
  onResolved: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({ conflict, userId, onResolved }) => {
  const [resolving, setResolving] = useState<'local' | 'remote' | null>(null);
  const resolve = async (choice: 'local' | 'remote') => {
    setResolving(choice);
    await resolvePendingSyncConflict(choice, userId);
    onResolved();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
      <div className="w-full max-w-lg rounded-2xl border border-amber-700/50 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/50 p-2.5 text-amber-300"><ShieldAlert className="h-5 w-5" /></div>
            <div>
              <h2 id="sync-conflict-title" className="font-heading text-base font-bold text-white">Changes found on two devices</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">PAIOS paused sync to protect both versions. Choose which complete workspace should become current.</p>
            </div>
          </div>
          <button type="button" onClick={onResolved} className="p-1 text-slate-500 hover:text-white" aria-label="Close conflict review"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400">Cloud version updated {new Date(conflict.remoteUpdatedAt).toLocaleString()}. Choosing this device uploads your current workspace; choosing cloud replaces local workspace data.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={Boolean(resolving)} onClick={() => resolve('local')} className="rounded-xl border border-indigo-700/60 bg-indigo-950/40 p-4 text-left hover:bg-indigo-900/50 disabled:opacity-50">
            <Laptop className="h-5 w-5 text-indigo-300" /><span className="mt-2 block text-sm font-semibold text-white">Keep this device</span><span className="mt-1 block text-[11px] text-slate-400">Upload what you see here.</span>
          </button>
          <button type="button" disabled={Boolean(resolving)} onClick={() => resolve('remote')} className="rounded-xl border border-cyan-800/60 bg-cyan-950/30 p-4 text-left hover:bg-cyan-900/40 disabled:opacity-50">
            <Cloud className="h-5 w-5 text-cyan-300" /><span className="mt-2 block text-sm font-semibold text-white">Use cloud version</span><span className="mt-1 block text-[11px] text-slate-400">Load the other device’s workspace.</span>
          </button>
        </div>
      </div>
    </div>
  );
};
