import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Waves,
  CheckCircle2,
  X,
  Sliders,
  Scale,
  Target,
  PiggyBank,
  ArrowDown,
  Star,
  CornerDownRight,
  Info,
} from 'lucide-react';
import { SavingsPot, DailySurplusRecord, BudgetProfile } from '../../types';
import { MoneyManagerPlugin } from '../../core/plugins/MoneyManagerPlugin';
import { PAIOSStorage, getTodayDateString } from '../../storage';
import { POT_ICONS } from './SavingsPotCard';

export interface DailySweepPourModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSurplus: number;
  currency: string;
  pots: SavingsPot[];
  profile: BudgetProfile;
  todayBudget: number;
  todayActualSpend: number;
  onPourSuccess: () => void;
}

export const DailySweepPourModal: React.FC<DailySweepPourModalProps> = ({
  isOpen,
  onClose,
  availableSurplus,
  currency,
  pots,
  profile,
  todayBudget,
  todayActualSpend,
  onPourSuccess,
}) => {
  const [distributionMode, setDistributionMode] = useState<'PRIORITY_FIRST' | 'EVEN' | 'CUSTOM'>(
    'PRIORITY_FIRST'
  );
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [generalSavings, setGeneralSavings] = useState<number>(0);
  const [isPouring, setIsPouring] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [overflowMessage, setOverflowMessage] = useState<string | null>(null);

  // Initialize distribution when opened
  useEffect(() => {
    if (isOpen && availableSurplus > 0) {
      setIsPouring(false);
      setIsSuccess(false);
      setOverflowMessage(null);

      if (pots.length > 0) {
        handleFillPriorityFirst();
      } else {
        setAllocations({});
        setGeneralSavings(availableSurplus);
      }
    }
  }, [isOpen, availableSurplus, pots]);

  if (!isOpen) return null;

  const totalPotAllocated = Object.values(allocations).reduce((acc, val) => acc + (val || 0), 0);
  const totalAllocated = Math.round((totalPotAllocated + generalSavings) * 100) / 100;
  const remainingUnallocated = Math.max(0, Math.round((availableSurplus - totalAllocated) * 100) / 100);

  const handleFillPriorityFirst = () => {
    setDistributionMode('PRIORITY_FIRST');
    const dist = MoneyManagerPlugin.distributeLeftoverSweep(availableSurplus, pots, 'PRIORITY_FIRST');
    const newMap: Record<string, number> = {};
    dist.forEach((d) => {
      newMap[d.potId] = d.amount;
    });
    setAllocations(newMap);
    setGeneralSavings(0);

    // Detect if overflow happened
    const overflowItem = dist.find((d) => d.isOverflow);
    if (overflowItem) {
      const destPot = pots.find((p) => p.id === overflowItem.potId);
      const primaryItem = dist.find((d) => !d.isOverflow);
      const primaryPot = pots.find((p) => p.id === primaryItem?.potId);
      if (primaryPot && destPot) {
        setOverflowMessage(
          `${primaryPot.title} reached 100%! Overflow ${currency}${overflowItem.amount.toFixed(
            2
          )} routed to ${destPot.title}.`
        );
        return;
      }
    }
    setOverflowMessage(null);
  };

  const handleDistributeEvenly = () => {
    setDistributionMode('EVEN');
    setOverflowMessage(null);
    const dist = MoneyManagerPlugin.distributeLeftoverSweep(availableSurplus, pots, 'EVEN');
    const newMap: Record<string, number> = {};
    dist.forEach((d) => {
      newMap[d.potId] = d.amount;
    });
    setAllocations(newMap);
    setGeneralSavings(0);
  };

  const handleResetCustom = () => {
    setDistributionMode('CUSTOM');
    setOverflowMessage(null);
    setAllocations({});
    setGeneralSavings(0);
  };

  const handlePotSliderChange = (potId: string, value: number) => {
    setDistributionMode('CUSTOM');
    setOverflowMessage(null);
    const currentPotVal = allocations[potId] || 0;
    const maxPossible = currentPotVal + remainingUnallocated;
    const clampedVal = Math.min(maxPossible, Math.max(0, value));

    setAllocations((prev) => ({
      ...prev,
      [potId]: Math.round(clampedVal * 100) / 100,
    }));
  };

  const handleConfirmPour = async () => {
    if (totalAllocated <= 0) return;

    setIsPouring(true);

    // Give visual animation 1.3s to pour water into the jars
    setTimeout(() => {
      const todayStr = getTodayDateString();

      // 1. Allocate into specific pots (PAIOSStorage handles cascade routing internally)
      let routedNotice: string | null = null;
      Object.entries(allocations).forEach(([potId, amt]) => {
        if (amt > 0) {
          const res = PAIOSStorage.allocateToPot(
            potId,
            amt,
            'DAILY_LEFTOVER_SWEEP',
            `End-of-day surplus sweep (${todayStr})`,
            todayStr
          );
          if (res.overflowRouted) {
            routedNotice = `${res.overflowRouted.fromPotTitle} reached 100%! Overflow ${currency}${res.overflowRouted.amount.toFixed(
              2
            )} routed to ${res.overflowRouted.toPotTitle}.`;
          }
        }
      });

      if (routedNotice) {
        setOverflowMessage(routedNotice);
      }

      // 2. Update profile savings balance
      const updatedProfile: BudgetProfile = {
        ...profile,
        currentSaved: (profile.currentSaved || 0) + totalAllocated,
        updatedAtMillis: Date.now(),
      };
      PAIOSStorage.saveBudgetProfile(updatedProfile);

      // 3. Record daily surplus record
      const surplusRecord: DailySurplusRecord = {
        id: `surplus_${todayStr}`,
        dateString: todayStr,
        dailySafeBudget: todayBudget,
        actualSpend: todayActualSpend,
        sweptAmount: totalAllocated,
        timestampMillis: Date.now(),
      };
      PAIOSStorage.saveDailySurplus(surplusRecord);

      setIsPouring(false);
      setIsSuccess(true);

      setTimeout(() => {
        onPourSuccess();
        onClose();
      }, 1200);
    }, 1300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Waves className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <span>Daily Leftover Sweep &amp; Pour</span>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full">
                  1-Click Midnight Pour
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                You have unspent discretionary cash today. Pour it into your target savings pots!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isPouring}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Leftover Surplus Available Strip */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-950 to-indigo-950/80 p-4 rounded-2xl border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
              Available Cash To Pour Today
            </span>
            <div className="text-2xl font-black font-mono text-emerald-300">
              {currency}{availableSurplus.toFixed(2)}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block font-mono">Unallocated Balance</span>
            <div
              className={`text-sm font-bold font-mono ${
                remainingUnallocated === 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {currency}{remainingUnallocated.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 3 Quick Distribution Modes */}
        {pots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={handleFillPriorityFirst}
              className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                distributionMode === 'PRIORITY_FIRST'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Priority First</span>
            </button>

            <button
              type="button"
              onClick={handleDistributeEvenly}
              className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                distributionMode === 'EVEN'
                  ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Split Evenly</span>
            </button>

            <button
              type="button"
              onClick={handleResetCustom}
              className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                distributionMode === 'CUSTOM'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Custom Sliders</span>
            </button>
          </div>
        )}

        {/* Overflow Feedback Alert Banner */}
        {overflowMessage && (
          <div className="p-3 bg-cyan-950/70 border border-cyan-500/40 rounded-2xl flex items-center gap-2.5 text-xs text-cyan-200 animate-fade-in">
            <CornerDownRight className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-mono">{overflowMessage}</span>
          </div>
        )}

        {/* Pots Slider & Allocation Rows */}
        <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
          {pots.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
              No target savings pots created yet. Surplus will be poured entirely into General Emergency Savings.
            </div>
          ) : (
            pots.map((pot) => {
              const allocatedAmt = allocations[pot.id] || 0;
              const IconComp = POT_ICONS[pot.iconName] || Target;
              const projectedAmount = pot.currentAmount + allocatedAmt;
              const projectedProgress = Math.min(
                100,
                Math.round((projectedAmount / pot.targetAmount) * 100)
              );

              return (
                <div
                  key={pot.id}
                  className={`bg-slate-950/80 p-3.5 rounded-2xl border transition-all space-y-2 ${
                    pot.isPriorityJar
                      ? 'border-amber-500/40 bg-slate-950'
                      : 'border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white block">{pot.title}</span>
                          {pot.isPriorityJar && (
                            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 border border-amber-800/60 px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-current" /> Priority
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Current: {currency}{pot.currentAmount.toLocaleString()} / {currency}
                          {pot.targetAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-mono text-xs">+</span>
                      <span className="text-emerald-400 font-mono font-bold text-sm">
                        {currency}{allocatedAmt.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max={availableSurplus}
                      step="1"
                      value={allocatedAmt}
                      onChange={(e) => handlePotSliderChange(pot.id, parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 w-12 text-right">
                      {projectedProgress}%
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* General Emergency Savings Fallback Row */}
          <div className="bg-slate-950/80 p-3 rounded-2xl border border-teal-500/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300">
                <PiggyBank className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-slate-200">General Emergency Vault</span>
                <span className="text-[10px] text-slate-500 block">Unallocated liquid savings</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-teal-400 font-bold">
                +{currency}{generalSavings.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setGeneralSavings(remainingUnallocated + generalSavings);
                }}
                disabled={remainingUnallocated <= 0}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-[10px] text-slate-300"
              >
                Pour Remainder
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Pouring Animation State */}
        <AnimatePresence>
          {isPouring && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center space-y-4 z-40"
            >
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="p-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-xl shadow-emerald-500/30"
              >
                <ArrowDown className="w-8 h-8 animate-bounce" />
              </motion.div>

              <div className="text-center space-y-1">
                <h4 className="font-heading font-black text-lg text-white">
                  Pouring {currency}{totalAllocated.toFixed(2)} Into Savings Jars...
                </h4>
                <p className="text-xs text-emerald-400 font-mono">
                  Refreshing liquid water levels &amp; securing balances
                </p>
              </div>

              <div className="w-36 h-2 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          )}

          {isSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center space-y-3 z-40 px-6 text-center"
            >
              <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="font-heading font-black text-lg text-white">
                Pour Complete! 🌊
              </h4>
              {overflowMessage && (
                <p className="text-xs text-cyan-300 font-mono max-w-sm">
                  {overflowMessage}
                </p>
              )}
              <p className="text-xs text-slate-300 font-mono">
                Allocations recorded and balances updated offline-first.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isPouring}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmPour}
            disabled={isPouring || totalAllocated <= 0}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Confirm &amp; Pour Water 🌊</span>
          </button>
        </div>
      </div>
    </div>
  );
};
