import React, { useState, useEffect } from 'react';
import { TransactionRecord } from '../../core/actions/actionTypes';
import { ActionStorage } from '../../core/actions/actionStorage';
import { ActionUndoManager } from '../../core/actions/ActionUndoManager';
import {
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
  Monitor,
  Smartphone,
  Globe,
  Clock,
  X,
  Search,
} from 'lucide-react';

interface ActionHistoryProps {
  onClose: () => void;
  onRefreshAppState?: () => void;
}

type FilterCategory = 'ALL' | 'TASKS' | 'HEALTH' | 'MONEY' | 'PLANNING' | 'UNDONE' | 'FAILED';

export const ActionHistory: React.FC<ActionHistoryProps> = ({ onClose, onRefreshAppState }) => {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const loadTransactions = () => {
    setTransactions(ActionStorage.getAllTransactions());
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleUndo = async (txId: string) => {
    setUndoingId(txId);
    setUndoError(null);
    try {
      const res = await ActionUndoManager.undoTransaction(txId);
      if (res.success) {
        loadTransactions();
        if (onRefreshAppState) onRefreshAppState();
      } else {
        setUndoError(res.message);
      }
    } finally {
      setUndoingId(null);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    // Category filtering
    if (filter === 'UNDONE' && tx.undoStatus !== 'UNDONE') return false;
    if (filter === 'FAILED' && tx.status !== 'FAILED' && tx.status !== 'ROLLED_BACK') return false;
    if (filter === 'TASKS') {
      const hasTask = tx.actions.some((a) => a.type.includes('TASK'));
      if (!hasTask) return false;
    }
    if (filter === 'HEALTH') {
      const hasHealth = tx.actions.some((a) => a.type.includes('MEDICATION') || a.type.includes('SYMPTOM') || a.type.includes('VITAL'));
      if (!hasHealth) return false;
    }
    if (filter === 'MONEY') {
      const hasMoney = tx.actions.some((a) => a.type.includes('EXPENSE') || a.type.includes('INCOME'));
      if (!hasMoney) return false;
    }
    if (filter === 'PLANNING') {
      const hasPlan = tx.actions.some((a) => a.type.includes('TIMETABLE') || a.type.includes('FOCUS') || a.type.includes('REPLAN'));
      if (!hasPlan) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCmd = tx.originalCommand.toLowerCase().includes(q);
      const matchActs = tx.actions.some((a) => a.title.toLowerCase().includes(q));
      if (!matchCmd && !matchActs) return false;
    }

    return true;
  });

  const getPlatformIcon = (platform: string) => {
    if (platform === 'windows') return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
    if (platform === 'android') return <Smartphone className="w-3.5 h-3.5 text-emerald-400" />;
    return <Globe className="w-3.5 h-3.5 text-cyan-400" />;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Action History"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Action History & Audit Ledger</h3>
              <p className="text-xs text-slate-400">Deterministic transaction records across devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Close action history"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="p-3 border-b border-slate-800/80 bg-slate-900/60 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit transactions..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {(['ALL', 'TASKS', 'HEALTH', 'MONEY', 'PLANNING', 'UNDONE', 'FAILED'] as FilterCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  filter === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {cat.charAt(0) + cat.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {undoError && (
            <div role="alert" className="mt-2 p-2.5 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center justify-between">
              <span>{undoError}</span>
              <button onClick={() => setUndoError(null)} className="text-red-400 hover:text-red-200 ml-2 font-medium">Dismiss</button>
            </div>
          )}
        </div>

        {/* Transactions List */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No transactions matching the selected filter.
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isSuccess = tx.status === 'COMMITTED' || tx.status === 'SYNCED';
              const isUndone = tx.undoStatus === 'UNDONE';
              const isFailed = tx.status === 'FAILED' || tx.status === 'ROLLED_BACK';

              return (
                <div
                  key={tx.id}
                  className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isUndone ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            UNDONE
                          </span>
                        ) : isFailed ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                            {tx.status}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            COMMITTED
                          </span>
                        )}

                        <span className="text-xs font-semibold text-white truncate">
                          {tx.originalCommand || tx.actions[0]?.title}
                        </span>
                      </div>

                      {/* Executed actions preview */}
                      <div className="mt-1 space-y-0.5">
                        {tx.actions.map((act) => (
                          <p key={act.id} className="text-[11px] text-slate-300 truncate">
                            • {act.title}
                          </p>
                        ))}
                      </div>

                      {tx.failureReason && (
                        <p className="text-[11px] text-red-300 mt-1 italic">
                          Reason: {tx.failureReason}
                        </p>
                      )}
                    </div>

                    {/* Metadata & Undo button */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {getPlatformIcon(tx.sourcePlatform)}
                        <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {isSuccess && tx.undoStatus === 'AVAILABLE' && (
                        <button
                          type="button"
                          onClick={() => handleUndo(tx.id)}
                          disabled={undoingId === tx.id}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-[11px] text-indigo-300 hover:text-white transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3 h-3 ${undoingId === tx.id ? 'animate-spin' : ''}`} />
                          <span>{undoingId === tx.id ? 'Undoing...' : 'Undo'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
