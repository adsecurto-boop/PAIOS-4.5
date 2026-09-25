import React from 'react';
import { TransactionExecutionReport } from '../../core/actions/ActionTransactionManager';
import { CheckCircle, AlertOctagon, RotateCcw, ArrowRight } from 'lucide-react';

interface ActionResultProps {
  report: TransactionExecutionReport;
  onUndo: (transactionId: string) => void;
  onClose: () => void;
  isUndoing?: boolean;
}

export const ActionResult: React.FC<ActionResultProps> = ({
  report,
  onUndo,
  onClose,
  isUndoing = false,
}) => {
  const { success, transaction, message, rolledBack, executedActions } = report;

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-200">
      {/* Status Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-start gap-3 ${
          success
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            : rolledBack
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-red-500/10 border-red-500/30 text-red-200'
        }`}
      >
        {success ? (
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white">
            {success
              ? 'Operation Committed Successfully'
              : rolledBack
              ? 'Operation Rolled Back'
              : 'Execution Failed'}
          </h4>
          <p className="text-xs opacity-90 mt-1 leading-relaxed">{message}</p>
        </div>
      </div>

      {/* Executed Actions list */}
      {success && executedActions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-400">Committed Changes:</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {executedActions.map((act) => (
              <div
                key={act.id}
                className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-medium text-slate-200 truncate">
                  {act.title}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                  {act.type}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 italic pt-1">
            ✓ Changes saved locally on this device and synchronized.
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        {success && transaction.undoStatus === 'AVAILABLE' ? (
          <button
            type="button"
            onClick={() => onUndo(transaction.id)}
            disabled={isUndoing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
            <span>{isUndoing ? 'Undoing...' : 'Undo'}</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
        >
          <span>Done</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
