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
  Users,
  Percent,
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

  // Balance Sheet & Current Wealth Position
  const [currentBalance, setCurrentBalance] = useState(initialProfile.currentBalance ?? 3500);
  const [currentSaved, setCurrentSaved] = useState(initialProfile.currentSaved ?? 8000);
  const [currentInvested, setCurrentInvested] = useState(initialProfile.currentInvested ?? 15000);
  const [currentDebt, setCurrentDebt] = useState(initialProfile.currentDebt ?? 12000);
  const [debtInterestRate, setDebtInterestRate] = useState(initialProfile.debtInterestRate ?? 12);
  const [savingsInterestRate, setSavingsInterestRate] = useState(initialProfile.savingsInterestRate ?? 4);

  // Necessities & Obligations
  const [foodMonthly, setFoodMonthly] = useState(initialProfile.foodMonthly || 800);
  const [travelMonthly, setTravelMonthly] = useState(initialProfile.travelMonthly || 300);
  const [healthMonthly, setHealthMonthly] = useState(initialProfile.healthMonthly || 250);
  const [housingMonthly, setHousingMonthly] = useState(initialProfile.housingMonthly || 1400);
  const [loanClearanceMonthly, setLoanClearanceMonthly] = useState(initialProfile.loanClearanceMonthly || 400);
  const [familyContributionMonthly, setFamilyContributionMonthly] = useState(
    initialProfile.familyContributionMonthly ?? 400
  );

  // Growth & Planned
  const [learningMonthly, setLearningMonthly] = useState(initialProfile.learningMonthly || 200);
  const [investingMonthly, setInvestingMonthly] = useState(initialProfile.investingMonthly || 650);
  const [savingsMonthly, setSavingsMonthly] = useState(initialProfile.savingsMonthly || 500);
  const [expectedAnnualReturnRate, setExpectedAnnualReturnRate] = useState(
    initialProfile.expectedAnnualReturnRate || 10
  );

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  if (!isOpen) return null;

  const totalFixed =
    Number(foodMonthly) +
    Number(travelMonthly) +
    Number(healthMonthly) +
    Number(housingMonthly) +
    Number(loanClearanceMonthly) +
    Number(familyContributionMonthly);

  const totalGrowth = Number(learningMonthly) + Number(investingMonthly) + Number(savingsMonthly);
  const freeCapital = Math.max(0, Number(monthlySalary) - (totalFixed + totalGrowth));
  const estimatedDailySafe = Math.round((freeCapital / 30) * 100) / 100;
  const netWorth = (Number(currentBalance) + Number(currentSaved) + Number(currentInvested)) - Number(currentDebt);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: BudgetProfile = {
      ...initialProfile,
      id: initialProfile.id || 'user_budget_profile',
      currency,
      monthlySalary: Math.max(0, Number(monthlySalary)),
      salaryCycleDay: Math.max(1, Math.min(31, Number(salaryCycleDay))),
      // Balance Sheet
      currentBalance: Math.max(0, Number(currentBalance)),
      currentSaved: Math.max(0, Number(currentSaved)),
      currentInvested: Math.max(0, Number(currentInvested)),
      currentDebt: Math.max(0, Number(currentDebt)),
      debtInterestRate: Math.max(0, Number(debtInterestRate)),
      savingsInterestRate: Math.max(0, Number(savingsInterestRate)),
      // Obligations
      foodMonthly: Math.max(0, Number(foodMonthly)),
      travelMonthly: Math.max(0, Number(travelMonthly)),
      healthMonthly: Math.max(0, Number(healthMonthly)),
      housingMonthly: Math.max(0, Number(housingMonthly)),
      loanClearanceMonthly: Math.max(0, Number(loanClearanceMonthly)),
      familyContributionMonthly: Math.max(0, Number(familyContributionMonthly)),
      // Growth
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
                  Budget Planner & Wealth Setup
                </h3>
                <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full">
                  Step {activeStep} of 3
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Configure your monthly cashflow, balance sheet, family support, and growth targets
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
            1. Income & Balances
          </button>
          <button
            onClick={() => setActiveStep(2)}
            className={`py-1.5 rounded-lg transition-all ${
              activeStep === 2 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Fixed Obligations
          </button>
          <button
            onClick={() => setActiveStep(3)}
            className={`py-1.5 rounded-lg transition-all ${
              activeStep === 3 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Growth & Wealth
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* STEP 1: Income, Salary Cycle & Balance Sheet */}
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

              {/* Current Balances Section */}
              <div className="pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-cyan-400" />
                  <span>Current Balances & Wealth Positions</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Current Checking/Liquid Balance */}
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Current Checking / Liquid Cash</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 font-mono text-xs">{currency}</span>
                      <input
                        type="number"
                        min="0"
                        value={currentBalance}
                        onChange={(e) => setCurrentBalance(Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Current Emergency Savings */}
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Current Saved Amount (Emergency Fund)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 font-mono text-xs">{currency}</span>
                      <input
                        type="number"
                        min="0"
                        value={currentSaved}
                        onChange={(e) => setCurrentSaved(Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Current Total Invested */}
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Current Invested Portfolio</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 font-mono text-xs">{currency}</span>
                      <input
                        type="number"
                        min="0"
                        value={currentInvested}
                        onChange={(e) => setCurrentInvested(Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Current Outstanding Debt */}
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Current Total Debt (Loans, Cards)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 font-mono text-xs">{currency}</span>
                      <input
                        type="number"
                        min="0"
                        value={currentDebt}
                        onChange={(e) => setCurrentDebt(Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Worth Preview */}
              <div className="p-3 bg-slate-950/90 rounded-2xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Calculated Net Worth:</span>
                <strong className={`text-sm font-bold ${netWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {currency}{netWorth.toLocaleString()}
                </strong>
              </div>
            </div>
          )}

          {/* STEP 2: Fixed Obligations & Necessities (Including Family Contribution) */}
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
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <CreditCard className="w-3.5 h-3.5 text-orange-400" />
                    Monthly Loan Clearance / EMI
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={loanClearanceMonthly}
                    onChange={(e) => setLoanClearanceMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                {/* Family Contribution / Support */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-pink-400" />
                    Family Contribution & Support
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={familyContributionMonthly}
                    onChange={(e) => setFamilyContributionMonthly(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                    placeholder="Support sent to family/parents"
                  />
                </div>
              </div>

              {/* Debt Interest Rate Setting */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-orange-400" />
                  Debt Interest Rate (% p.a.):
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="0.1"
                    value={debtInterestRate}
                    onChange={(e) => setDebtInterestRate(Number(e.target.value))}
                    className="w-20 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-orange-300 text-center"
                  />
                  <span className="text-slate-500 font-mono">%</span>
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
                    Monthly Investing (SIP, Stocks, Mutual Funds)
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
                    Monthly Savings / Emergency Buffer
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

                {/* Expected Return Rate */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Expected Investment CAGR (% / Year)
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
