import React, { useEffect, useState } from 'react';
import { RotateCcw, X, Check } from 'lucide-react';

interface UndoToastProps {
  transactionId: string;
  summary: string;
  onUndo: (transactionId: string) => Promise<void>;
  onDismiss: () => void;
  durationSeconds?: number;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  transactionId,
  summary,
  onUndo,
  onDismiss,
  durationSeconds = 8,
}) => {
  const [progress, setProgress] = useState(100);
  const [isUndoing, setIsUndoing] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const totalMs = durationSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / totalMs) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [durationSeconds, onDismiss]);

  const handleUndoClick = async () => {
    setIsUndoing(true);
    try {
      await onUndo(transactionId);
    } finally {
      setIsUndoing(false);
      onDismiss();
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-50 animate-in slide-in-from-bottom-5 duration-200"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-3.5 flex items-center justify-between gap-3 text-slate-100">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <p className="text-xs font-medium text-slate-200 truncate">
            {summary}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndoClick}
            disabled={isUndoing}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 ${isUndoing ? 'animate-spin' : ''}`} />
            <span>{isUndoing ? 'Reverting...' : 'Undo'}</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Dismiss undo notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Progress countdown bar */}
      <div className="h-0.5 bg-slate-800 w-full overflow-hidden rounded-b-2xl">
        <div
          className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
