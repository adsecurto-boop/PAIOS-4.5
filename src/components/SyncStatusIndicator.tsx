import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { OfflineSyncManager, SyncLifecycleDetail } from '../core/sync/OfflineSyncManager';
import { getPendingSyncConflict, syncLocalToCloud } from '../firebase';

/** A deliberately conservative status indicator: it never claims a cloud write succeeded. */
export const SyncStatusIndicator: React.FC<{ userId?: string }> = ({ userId }) => {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [queuedChanges, setQueuedChanges] = useState(() => OfflineSyncManager.getQueue().length);
  const [syncState, setSyncState] = useState<SyncLifecycleDetail>({ status: 'idle', queuedChanges: 0 });

  useEffect(() => {
    const refresh = () => {
      setIsOnline(navigator.onLine);
      setQueuedChanges(OfflineSyncManager.getQueue().length);
    };
    const handleSyncStatus = (event: Event) => {
      const detail = (event as CustomEvent<SyncLifecycleDetail>).detail;
      setSyncState(detail);
      setQueuedChanges(OfflineSyncManager.getQueue().length);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('paios_storage_change', refresh);
    window.addEventListener('paios_sync_status', handleSyncStatus);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('paios_storage_change', refresh);
      window.removeEventListener('paios_sync_status', handleSyncStatus);
      window.clearInterval(timer);
    };
  }, []);

  const retrySync = async () => {
    if (getPendingSyncConflict()) {
      window.dispatchEvent(new Event('paios_sync_conflict'));
      return;
    }

    setSyncState((current) => ({ ...current, status: 'syncing', message: undefined }));
    const queueResult = await OfflineSyncManager.flushQueue();
    const remaining = OfflineSyncManager.getQueue().length;
    setQueuedChanges(remaining);

    if (!queueResult.success) {
      setSyncState({
        status: 'error',
        queuedChanges: remaining,
        message: `${remaining} local change${remaining === 1 ? '' : 's'} still waiting to sync`,
      });
      return;
    }

    const cloudSynced = userId ? await syncLocalToCloud(userId) : true;
    if (cloudSynced) {
      setSyncState({ status: 'synced', queuedChanges: remaining, lastSyncedAt: Date.now() });
    }
  };

  if (!isOnline) {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-300" title="Changes remain safely saved on this device and will retry when you reconnect.">
        <CloudOff className="h-3.5 w-3.5" /> Offline{queuedChanges ? ` · ${queuedChanges} waiting` : ''}
      </span>
    );
  }

  if (syncState.status === 'error') {
    return (
      <button type="button" onClick={retrySync} className="flex items-center gap-1 rounded-lg border border-rose-800/60 bg-rose-950/40 px-2 py-1 text-[10px] font-semibold text-rose-300" title={`${syncState.message || 'Sync needs attention'}. Click to ${getPendingSyncConflict() ? 'review the conflict' : 'retry'}.`}>
        <AlertCircle className="h-3.5 w-3.5" /> {getPendingSyncConflict() ? 'Review sync conflict' : 'Sync needs attention'}
      </button>
    );
  }

  if (syncState.status === 'syncing') {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-indigo-700/60 bg-indigo-950/40 px-2 py-1 text-[10px] font-semibold text-indigo-200" title="PAIOS is syncing local changes.">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing{queuedChanges ? ` ${queuedChanges}` : ''}
      </span>
    );
  }

  if (queuedChanges > 0) {
    return (
      <button type="button" onClick={retrySync} className="flex items-center gap-1 rounded-lg border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-200" title={`${queuedChanges} local change${queuedChanges === 1 ? '' : 's'} waiting. Click to retry.`}>
        <CloudOff className="h-3.5 w-3.5" /> {queuedChanges} waiting
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-lg border border-emerald-800/60 bg-emerald-950/35 px-2 py-1 text-[10px] font-semibold text-emerald-300" title="Connected. Changes are saved locally and eligible to sync.">
      <CheckCircle2 className="h-3.5 w-3.5" /> {syncState.status === 'synced' ? 'Synced' : 'Connected'}
    </span>
  );
};
