import React, { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { OfflineSyncManager } from '../core/sync/OfflineSyncManager';

/** A deliberately conservative status indicator: it never claims a cloud write succeeded. */
export const SyncStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [queuedChanges, setQueuedChanges] = useState(() => OfflineSyncManager.getQueue().length);

  useEffect(() => {
    const refresh = () => {
      setIsOnline(navigator.onLine);
      setQueuedChanges(OfflineSyncManager.getQueue().length);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('paios_storage_change', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('paios_storage_change', refresh);
      window.clearInterval(timer);
    };
  }, []);

  if (!isOnline) {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-300" title="Changes remain safely saved on this device and will retry when you reconnect.">
        <CloudOff className="h-3.5 w-3.5" /> Offline{queuedChanges ? ` · ${queuedChanges} waiting` : ''}
      </span>
    );
  }

  if (queuedChanges > 0) {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-indigo-700/60 bg-indigo-950/40 px-2 py-1 text-[10px] font-semibold text-indigo-200" title="PAIOS is retrying queued changes.">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing {queuedChanges}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-lg border border-emerald-800/60 bg-emerald-950/35 px-2 py-1 text-[10px] font-semibold text-emerald-300" title="Connected. Changes are saved locally and eligible to sync.">
      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
    </span>
  );
};
