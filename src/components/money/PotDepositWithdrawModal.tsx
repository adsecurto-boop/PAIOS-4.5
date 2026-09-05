import React, { useState, useEffect } from 'react';
import { X, Plus, ArrowUpRight, AlertTriangle, Hammer, ShieldAlert } from 'lucide-react';
import { SavingsPot, WithdrawalReasonCategory } from '../../types';
import { MoneyManagerPlugin } from '../../core/plugins/MoneyManagerPlugin';

export interface PotDepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  pot: SavingsPot | null;
  mode: 'DEPOSIT' | 'WITHDRAW';
  currency: string;
  averageDailySurplus?: number;
  dailySafeBudget?: number;
  onConfirm: (
    potId: string,
    amount: number,
    mode: 'DEPOSIT' | 'WITHDRAW',
    source?: 'MANUAL_DEPOSIT' | 'WINDFALL',
    reasonCategory?: WithdrawalReasonCategory,
    notes?: string
  ) => void;
}

const REASON_OPTIONS: Array<{ id: WithdrawalReasonCategory; label: string; icon: string }> = [
  { id: 'MEDICAL_EMERGENCY', label: 'Medical / Health Emergency', icon: '🩺' },
  { id: 'CRITICAL_BILL_OR_DEBT', label: 'Critical Bill or High-Interest Debt', icon: '⚡' },
  { id: 'URGENT_FAMILY_SUPPORT', label: 'Urgent Family Support', icon: '👨‍👩‍👦' },
  { id: 'IMPULSE_OR_OTHER', label: 'Discretionary / Impulse / Other', icon: '⚠️' },
];

export const PotDepositWithdrawModal: React.FC<PotDepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  pot,
  mode,
  currency,
  averageDailySurplus = 0,
  dailySafeBudget = 0,
  onConfirm,
}) => {
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'MANUAL_DEPOSIT' | 'WINDFALL'>('MANUAL_DEPOSIT');
  const [reasonCategory, setReasonCategory] =
    useState<WithdrawalReasonCategory>('MEDICAL_EMERGENCY');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setAmount('');
    setNotes('');
    setSource('MANUAL_DEPOSIT');
    setReasonCategory('MEDICAL_EMERGENCY');
  }, [isOpen, pot, mode]);

  if (!isOpen || !pot) return null;

  const numAmount = parseFloat(amount) || 0;
  const resultingBalance =
    mode === 'DEPOSIT'
      ? pot.currentAmount + numAmount
      : Math.max(0, pot.currentAmount - numAmount);

  const setbackDays = MoneyManagerPlugin.calculateWithdrawalSetbackDays(
    numAmount,
    averageDailySurplus,
    dailySafeBudget
  );

  const isWithdrawalValid =
    mode === 'WITHDRAW' ? numAmount > 0 && numAmount <= pot.currentAmount && notes.trim().length > 0 : true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    if (mode === 'WITHDRAW' && !isWithdrawalValid) return;

    onConfirm(
      pot.id,
      numAmount,
      mode,
      source,
      mode === 'WITHDRAW' ? reasonCategory : undefined,
      notes.trim() || undefined
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-2xl ${
                mode === 'DEPOSIT'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {mode === 'DEPOSIT' ? (
                <Plus className="w-5 h-5" />
              ) : (
                <Hammer className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white">
                {mode === 'DEPOSIT' ? 'Add Money to Pot' : 'Break Jar Emergency Prompt 🔨'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                {mode === 'DEPOSIT'
                  ? `Deposit funds into ${pot.title}`
                  : 'Guarding your psychological savings momentum'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Current Pot Status */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block font-mono">Current Water Level</span>
              <span className="font-bold text-white font-mono">
                {currency}{pot.currentAmount.toLocaleString()}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block font-mono">Target Goal</span>
              <span className="font-bold text-slate-300 font-mono">
                {currency}{pot.targetAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Deposit Source Pill (Deposit Mode Only) */}
          {mode === 'DEPOSIT' ? (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Deposit Type</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSource('MANUAL_DEPOSIT')}
                  className={`py-1.5 rounded-lg transition-all ${
                    source === 'MANUAL_DEPOSIT'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Manual Deposit
                </button>
                <button
                  type="button"
                  onClick={() => setSource('WINDFALL')}
                  className={`py-1.5 rounded-lg transition-all ${
                    source === 'WINDFALL'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bonus / Windfall
                </button>
              </div>
            </div>
          ) : (
            /* Withdrawal Emergency Reasoning Friction */
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Emergency Reason (Mandatory Audit)</span>
              </label>

              <div className="grid grid-cols-1 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                {REASON_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReasonCategory(opt.id)}
                    className={`px-3 py-1.5 rounded-xl text-left text-xs font-semibold flex items-center gap-2 transition-all ${
                      reasonCategory === opt.id
                        ? 'bg-rose-950/80 text-rose-200 border border-rose-700/60 shadow'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Gentle Accountability Prompt for Impulse Spend */}
              {reasonCategory === 'IMPULSE_OR_OTHER' && numAmount > 0 && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-2xl flex items-start gap-2.5 text-xs text-amber-200 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Accountability Check</span>
                    <p className="text-[11px] text-amber-300/90 mt-0.5 leading-relaxed">
                      Withdrawing <strong>{currency}{numAmount.toLocaleString()}</strong> will set back your <strong>&ldquo;{pot.title}&rdquo;</strong> goal by approximately <strong>{setbackDays} days</strong>. Are you sure you want to proceed?
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Amount ({currency})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs">{currency}</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                max={mode === 'WITHDRAW' ? pot.currentAmount : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.00"
                className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            {mode === 'WITHDRAW' && (
              <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                Max available to withdraw: {currency}{pot.currentAmount.toLocaleString()}
              </span>
            )}
          </div>

          {/* Mandatory Justification Note for Withdrawals */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {mode === 'WITHDRAW' ? 'Justification Note (Required)' : 'Memo / Remarks (Optional)'}
            </label>
            <input
              type="text"
              required={mode === 'WITHDRAW'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'WITHDRAW'
                  ? 'e.g. Urgent car repair, prescription refill invoice'
                  : 'e.g. Extra freelance bonus deposit'
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Resulting Balance Preview */}
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Resulting Pot Balance:</span>
            <span className="font-mono font-bold text-cyan-400">
              {currency}{resultingBalance.toLocaleString()}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                numAmount <= 0 ||
                (mode === 'WITHDRAW' && (!isWithdrawalValid || numAmount > pot.currentAmount))
              }
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-lg disabled:opacity-40 transition-all ${
                mode === 'DEPOSIT'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/30'
              }`}
            >
              {mode === 'DEPOSIT' ? 'Confirm Deposit' : 'Break Jar & Withdraw'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
