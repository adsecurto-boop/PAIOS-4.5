import React, { useState } from 'react';
import {
  X,
  DollarSign,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  PieChart,
  Sparkles,
  TrendingUp,
  AlertCircle,
  CreditCard,
  Home,
  Utensils,
  Car,
  HeartPulse,
  BookOpen,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { BudgetProfile } from '../../types';

interface BudgetSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile: BudgetProfile;
  onSaveProfile: (profile: BudgetProfile) => void;
}

export const BudgetSetupModal: React.FC<BudgetSetupModalProps> = ({
  isOpen,
  onClose,
  initialProfile,
  onSaveProfile,
}) => {
  const [currency, setCurrency] = useState(initialProfile.currency || '$');
  const [monthlySalary, setMonthlySalary] = useState(initialProfile.monthlySalary || 5000);
  const [salaryCycleDay, setSalaryCycleDay] = useState(initialProfile.salaryCycleDay || 1);

  // Necessities
  const [foodMonthly, setFoodMonthly] = useState(initialProfile.foodMonthly || 800);
  const [travelMonthly, setTravelMonthly] = useState(initialProfile.travelMonthly || 300);
  const [healthMonthly, setHealthMonthly] = useState(initialProfile.healthMonthly || 250);
  const [housingMonthly, setHousingMonthly] = useState(initialProfile.housingMonthly || 1400);
  const [loanClearanceMonthly, setLoanClearanceMonthly] = useState(initialProfile.loanClearanceMonthly || 400);

  // Growth & Planned
  const [learningMonthly, setLearningMonthly] = useState(initialProfile.learningMonthly || 200);
  const [investingMonthly, setInvestingMonthly] = useState(initialProfile.investingMonthly || 650);
  const [savingsMonthly, setSavingsMonthly] = useState(initialProfile.savingsMonthly || 500);
  const [expectedAnnualReturnRate, setExpectedAnnualReturnRate] = useState(
    initialProfile.expectedAnnualReturnRate || 10
  );

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  if (!isOpen) return null;

  const totalFixed = foodMonthly + travelMonthly + healthMonthly + housingMonthly + loanClearanceMonthly;
  const totalGrowth = learningMonthly + investingMonthly + savingsMonthly;
  const freeCapital = Math.max(0, monthlySalary - (totalFixed + totalGrowth));
  const estimatedDailySafe = Math.round((freeCapital / 30) * 100) / 100;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: BudgetProfile = {
      ...initialProfile,
      id: initialProfile.id || 'user_budget_profile',
      currency,
      monthlySalary: Math.max(0, Number(monthlySalary)),
      salaryCycleDay: Math.max(1, Math.min(31, Number(salaryCycleDay))),
      foodMonthly: Math.max(0, Number(foodMonthly)),
      travelMonthly: Math.max(0, Number(travelMonthly)),
      healthMonthly: Math.max(0, Number(healthMonthly)),
      housingMonthly: Math.max(0, Number(housingMonthly)),
      loanClearanceMonthly: Math.max(0, Number(loanClearanceMonthly)),
      learningMonthly: Math.max(0, Number(learningMonthly)),
      investingMonthly: Math.max(0, Number(investingMonthly)),
      savingsMonthly: Math.max(0, Number(savingsMonthly)),
      discretionaryMonthly: freeCapital,
      expectedAnnualReturnRate: Math.max(1, Math.min(30, Number(expectedAnnualReturnRate))),
      updatedAtMillis: Date.now(),
    };
    onSaveProfile(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 relative overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/30 shrink-0">
              <PiggyBank className="w-7 h-7 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-extrabold text-lg text-white">
                  Budget Planner & Financial Setup
                </h3>
                <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full">
                  Step {activeStep} of 3
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Configure your monthly salary, fixed necessities, and daily safe-to-spend target
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Tabs */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveStep(1)}
            className={`py-1.5 rounded-lg transition-all ${
              activeStep === 1 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Income & Cycle
          </button>
          <button
            onClick={() => setActiveStep(2)}
            className={`py-1.5 rounded-lg transition-all ${
              activeStep === 2 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Fixed Necessities
          </button>
          <button
            onClick={() => setActiveStep(3)}
            className={`py-1.5 rounded-lg transition-all ${
              activeStep === 3 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Wealth & Review
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* STEP 1: Income & Salary Cycle */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Currency */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Currency Symbol</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="$">$ (USD / AUD / CAD)</option>
                    <option value="₹">₹ (INR - Rupee)</option>
                    <option value="€">€ (EUR - Euro)</option>
                    <option value="£">£ (GBP - British Pound)</option>
                    <option value="¥">¥ (JPY / CNY)</option>
                    <option value="AED">AED (Dirham)</option>
                  </select>
                </div>

                {/* Monthly Salary */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Monthly In-Hand Salary / Income
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono text-sm">{currency}</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 font-mono"
                      placeholder="5000"
                    />
                  </div>
                </div>
              </div>

              {/* Salary Cycle Day */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Salary Date / Start of Monthly Budget Cycle
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={salaryCycleDay}
                    onChange={(e) => setSalaryCycleDay(Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400">
                    Day {salaryCycleDay} of every month (e.g. 1st, 5th, 25th, or 30th)
                  </span>
                </div>
              </div>

              {/* Step 1 Quick Summary Preview */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Monthly Inflow:</span>
                <strong className="text-emerald-400 font-bold text-base">
                  {currency}{Number(monthlySalary).toLocaleString()}
                </strong>
              </div>
            </div>
          )}

          {/* STEP 2: Fixed Obligations & Necessities */}
          {activeStep === 2 && (
            <div className="space-y-3 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Food & Groceries */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Utensils className="w-3.5 h-3.5 text-amber-400" />
                    Food & Groceries
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={foodMonthly}
                    onChange={(e) => setFoodMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Travel & Commute */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Car className="w-3.5 h-3.5 text-cyan-400" />
                    Travel & Fuel / Commute
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={travelMonthly}
                    onChange={(e) => setTravelMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Rent & Housing / Utilities */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Home className="w-3.5 h-3.5 text-indigo-400" />
                    Rent, Housing & Utilities
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={housingMonthly}
                    onChange={(e) => setHousingMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Health & Medical / Insurance */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                    Health, Meds & Insurance
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={healthMonthly}
                    onChange={(e) => setHealthMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Loan Clearance / EMIs */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <CreditCard className="w-3.5 h-3.5 text-orange-400" />
                    Loan Clearance / EMI / Debt Obligations
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={loanClearanceMonthly}
                    onChange={(e) => setLoanClearanceMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Total Fixed Obligations:</span>
                <strong className="text-amber-300 font-bold">
                  {currency}{totalFixed.toLocaleString()} ({Math.round((totalFixed / (monthlySalary || 1)) * 100)}%)
                </strong>
              </div>
            </div>
          )}

          {/* STEP 3: Planned Growth & Review */}
          {activeStep === 3 && (
            <div className="space-y-3 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Investing & Stocks */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Investing (Mutual Funds, SIP, Stocks)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={investingMonthly}
                    onChange={(e) => setInvestingMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Savings Target */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <PiggyBank className="w-3.5 h-3.5 text-teal-400" />
                    Savings / Emergency Buffer Target
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={savingsMonthly}
                    onChange={(e) => setSavingsMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Learning / Upskilling */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                    Learning, Courses & Books
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={learningMonthly}
                    onChange={(e) => setLearningMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Compound Growth Expected Return */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Expected Return Rate (% / Year)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={expectedAnnualReturnRate}
                    onChange={(e) => setExpectedAnnualReturnRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Complete Financial Overview Box */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-indigo-500/30 space-y-2.5">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                  Automated Budget Breakdown (50/30/20)
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Needs</span>
                    <strong className="text-amber-300">{currency}{totalFixed}</strong>
                    <span className="text-[10px] text-slate-500 block">({Math.round((totalFixed / (monthlySalary || 1)) * 100)}%)</span>
                  </div>
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Free Capital</span>
                    <strong className="text-cyan-300">{currency}{freeCapital}</strong>
                    <span className="text-[10px] text-slate-500 block">({Math.round((freeCapital / (monthlySalary || 1)) * 100)}%)</span>
                  </div>
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Invest/Save</span>
                    <strong className="text-emerald-400">{currency}{totalGrowth}</strong>
                    <span className="text-[10px] text-slate-500 block">({Math.round((totalGrowth / (monthlySalary || 1)) * 100)}%)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs font-mono border-t border-slate-800/80">
                  <span className="text-slate-300">Estimated Safe-to-Spend Daily:</span>
                  <strong className="text-cyan-300 text-sm font-bold">
                    {currency}{estimatedDailySafe.toFixed(2)} / day
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Modal Navigation Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            {activeStep > 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep((activeStep - 1) as any)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Previous
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {activeStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep((activeStep + 1) as any)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold shadow-lg shadow-emerald-600/40 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Budget Plan</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
