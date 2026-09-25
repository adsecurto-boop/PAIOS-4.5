import React, { useState } from 'react';
import { ProposedAction, ActionRisk } from '../../core/actions/actionTypes';
import { ShieldAlert, AlertTriangle, CheckCircle2, Shield, Check, X, ArrowLeft } from 'lucide-react';

interface ActionPreviewProps {
  actions: ProposedAction[];
  onConfirm: (selectedActions: ProposedAction[]) => void;
  onCancel: () => void;
  onEditCommand: () => void;
  isExecuting?: boolean;
}

export const ActionPreview: React.FC<ActionPreviewProps> = ({
  actions,
  onConfirm,
  onCancel,
  onEditCommand,
  isExecuting = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(actions.map((a) => a.id))
  );

  const toggleAction = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // Keep at least one selected
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const highestRisk = actions.reduce<ActionRisk>((curr, a) => {
    if (a.risk === 'BLOCKED') return 'BLOCKED';
    if (a.risk === 'HIGH' && curr !== 'BLOCKED') return 'HIGH';
    if (a.risk === 'MEDIUM' && (curr === 'LOW' || !curr)) return 'MEDIUM';
    return curr;
  }, 'LOW');

  const selectedActions = actions.filter((a) => selectedIds.has(a.id));
  const isBlocked = actions.some((a) => a.risk === 'BLOCKED');

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-200">
      {/* Risk Header Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-start gap-3 ${
          highestRisk === 'BLOCKED'
            ? 'bg-red-500/10 border-red-500/30 text-red-200'
            : highestRisk === 'HIGH'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            : highestRisk === 'MEDIUM'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
        }`}
      >
        {highestRisk === 'BLOCKED' ? (
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        ) : highestRisk === 'HIGH' ? (
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        ) : highestRisk === 'MEDIUM' ? (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-white">
              {highestRisk === 'BLOCKED'
                ? 'Operation Blocked by Safety Policy'
                : highestRisk === 'HIGH'
                ? 'High-Impact Action Confirmation'
                : highestRisk === 'MEDIUM'
                ? 'Action Confirmation'
                : 'Action Proposal'}
            </h4>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                highestRisk === 'BLOCKED'
                  ? 'bg-red-500/20 text-red-300'
                  : highestRisk === 'HIGH'
                  ? 'bg-rose-500/20 text-rose-300'
                  : highestRisk === 'MEDIUM'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {highestRisk} Risk
            </span>
          </div>
          <p className="text-xs opacity-90 mt-1">
            {highestRisk === 'BLOCKED'
              ? 'This operation cannot be executed automatically due to safety policies.'
              : highestRisk === 'HIGH'
              ? 'This operation affects significant data. Please review each change below before proceeding.'
              : 'Review the proposed changes before executing.'}
          </p>
        </div>
      </div>

      {/* Action Items List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Proposed Changes ({selectedActions.length}/{actions.length})</span>
          <span>Undo available after commit</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {actions.map((action) => {
            const isSelected = selectedIds.has(action.id);
            return (
              <div
                key={action.id}
                className={`p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-slate-800/90 border-slate-700/80 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleAction(action.id)}
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                      aria-label="Toggle action selection"
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {action.title}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 shrink-0">
                        {action.type}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {action.explanation}
                    </p>

                    {/* Scoped Details breakdown */}
                    <div className="mt-2 text-[11px] text-slate-300 bg-slate-900/80 rounded-lg p-2 border border-slate-800/80 font-mono space-y-0.5">
                      {Object.entries(action.payload as Record<string, unknown>).map(([k, v]) => {
                        if (v === undefined || v === null || v === '') return null;
                        const displayVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
                        return (
                          <div key={k} className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">{k}:</span>
                            <span className="text-slate-200 truncate max-w-[200px]">{displayVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={onEditCommand}
          disabled={isExecuting}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit command</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="px-3.5 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {!isBlocked && (
            <button
              type="button"
              onClick={() => onConfirm(selectedActions)}
              disabled={isExecuting || selectedActions.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isExecuting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm ({selectedActions.length})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
