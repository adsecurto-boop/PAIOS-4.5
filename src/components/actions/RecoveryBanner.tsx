import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Download, X } from 'lucide-react';
import { ActionStorage } from '../../core/actions/actionStorage';
import { ActionRecovery } from '../../core/actions/ActionRecovery';
import { TransactionRecord } from '../../core/actions/actionTypes';

interface RecoveryBannerProps {
  onDismiss?: () => void;
  onRefreshAppState?: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({ onDismiss, onRefreshAppState }) => {
  const [recoveryTxs, setRecoveryTxs] = useState<TransactionRecord[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const checkRecovery = () => {
    const txs = ActionStorage.getRecoveryRequiredTransactions();
    setRecoveryTxs(txs);
  };

  useEffect(() => {
    checkRecovery();

    const handleStateChange = () => checkRecovery();
    if (typeof window !== 'undefined') {
      window.addEventListener('paios_state_change', handleStateChange);
      return () => window.removeEventListener('paios_state_change', handleStateChange);
    }
  }, []);

  if (recoveryTxs.length === 0) return null;

  const affectedStores = Array.from(
    new Set(recoveryTxs.flatMap((tx) => tx.unresolvedDetails?.stores || []))
  );

  const handleRetryRecovery = async () => {
    setIsRetrying(true);
    setRetryMessage(null);
    try {
      const report = await ActionRecovery.runStartupRecovery();
      checkRecovery();
      if (onRefreshAppState) onRefreshAppState();
      if (report.recoveredCount > 0) {
        setRetryMessage(`Successfully recovered ${report.recoveredCount} transaction(s).`);
      } else {
        setRetryMessage('Recovery completed. Remaining transactions still require manual attention.');
      }
    } catch (err: any) {
      setRetryMessage(`Retry failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleExportDiagnostic = () => {
    const diagnostic = JSON.stringify(recoveryTxs, null, 2);
    const blob = new Blob([diagnostic], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paios-recovery-diagnostic-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-amber-950/90 border-b border-amber-500/50 text-amber-200 px-4 py-3 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs z-40 relative backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <div className="font-bold text-amber-100 flex items-center gap-2">
            <span>Recovery Required</span>
            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full text-[10px] font-mono">
              {recoveryTxs.length} transaction(s) pending review
            </span>
          </div>
          <p className="text-amber-300/90 mt-0.5">
            Some action data could not be verified. Avoid editing the affected areas until recovery completes.
            {affectedStores.length > 0 && (
              <span className="block text-amber-400/80 font-mono text-[11px] mt-0.5">
                Affected stores: {affectedStores.join(', ')}
              </span>
            )}
          </p>
          {retryMessage && (
            <p className="text-amber-200 font-medium mt-1 bg-amber-900/50 px-2 py-1 rounded inline-block">
              {retryMessage}
            </p>
          )}
          <p className="text-amber-400/60 italic text-[10px] mt-0.5">
            If recovery fails, export the diagnostic and contact support before making further changes.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          onClick={handleRetryRecovery}
          disabled={isRetrying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 text-xs shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Recovering...' : 'Retry Recovery'}
        </button>
        <button
          onClick={handleExportDiagnostic}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-amber-500/30 text-amber-300 hover:bg-slate-800 transition-colors text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          Export Diagnostic
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className="p-1 rounded-lg text-amber-400 hover:text-amber-200 hover:bg-amber-900/30 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
