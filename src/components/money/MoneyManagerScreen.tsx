import React, { useState, useEffect } from 'react';
import {
  Wallet,
  DollarSign,
  TrendingUp,
  PiggyBank,
  Calendar,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Zap,
  ArrowRight,
  PieChart,
  Bot,
  Layers,
  Clock,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import {
  BudgetProfile,
  ExpenseTransaction,
  DailySurplusRecord,
  BudgetCategory,
} from '../../types';
import {
  MoneyManagerPlugin,
  DEFAULT_BUDGET_PROFILE,
} from '../../core/plugins/MoneyManagerPlugin';
import { PAIOSStorage, getTodayDateString } from '../../storage';
import { BudgetSetupModal } from './BudgetSetupModal';
import { ProjectedGrowthChart } from './ProjectedGrowthChart';
import { sendClientGeminiChat } from '../../geminiClient';

export const MoneyManagerScreen: React.FC = () => {
  const [profile, setProfile] = useState<BudgetProfile>(() => PAIOSStorage.getBudgetProfile());
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>(() =>
    PAIOSStorage.getExpenseTransactions()
  );
  const [surpluses, setSurpluses] = useState<DailySurplusRecord[]>(() =>
    PAIOSStorage.getDailySurpluses()
  );

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ALL');

  // Quick Expense Form State
  const [newExpenseTitle, setNewExpenseTitle] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<BudgetCategory>('Food');
  const [newExpenseIsNecessity, setNewExpenseIsNecessity] = useState(true);

  // AI Financial Advisor State
  const [isAnalyzingWithAi, setIsAnalyzingWithAi] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);

  // Today Date & Analysis
  const todayStr = getTodayDateString();
  const analysis = MoneyManagerPlugin.analyzeBudget(profile, transactions, new Date());
  const todaySurplusInfo = MoneyManagerPlugin.calculateDailySurplus(profile, transactions, todayStr);

  // Calculate moving average surplus for projection
  const totalSweptAllTime = surpluses.reduce((acc, s) => acc + (s.sweptAmount || 0), 0);
  const avgSurplus = surpluses.length > 0 ? totalSweptAllTime / surpluses.length : todaySurplusInfo.surplusAmount * 0.7;

  // Staging telemetry to PIT for AI agent
  useEffect(() => {
    MoneyManagerPlugin.stageBudgetTelemetryToPIT(profile, analysis);
  }, [profile, transactions]);

  const handleSaveProfile = (updated: BudgetProfile) => {
    setProfile(updated);
    PAIOSStorage.saveBudgetProfile(updated);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseTitle.trim() || !newExpenseAmount) return;

    const tx: ExpenseTransaction = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: newExpenseTitle.trim(),
      amount: Math.max(0.01, Number(newExpenseAmount)),
      category: newExpenseCategory,
      dateString: todayStr,
      timestampMillis: Date.now(),
      isNecessity: newExpenseIsNecessity,
    };

    PAIOSStorage.saveExpenseTransaction(tx);
    setTransactions(PAIOSStorage.getExpenseTransactions());
    setNewExpenseTitle('');
    setNewExpenseAmount('');
    setShowAddExpenseModal(false);
  };

  const handleDeleteExpense = (id: string) => {
    PAIOSStorage.deleteExpenseTransaction(id);
    setTransactions(PAIOSStorage.getExpenseTransactions());
  };

  const handleSweepDailySurplus = () => {
    if (todaySurplusInfo.surplusAmount <= 0) return;

    const record: DailySurplusRecord = {
      id: `surplus_${todayStr}`,
      dateString: todayStr,
      dailySafeBudget: todaySurplusInfo.dailyBudget,
      actualSpend: todaySurplusInfo.actualSpend,
      sweptAmount: todaySurplusInfo.surplusAmount,
      timestampMillis: Date.now(),
    };

    PAIOSStorage.saveDailySurplus(record);
    setSurpluses(PAIOSStorage.getDailySurpluses());
  };

  const isTodayAlreadySwept = surpluses.some((s) => s.dateString === todayStr);

  // Trigger Gemini AI Financial Consultation
  const handleAiFinancialAudit = async () => {
    setIsAnalyzingWithAi(true);
    setAiAdvice(null);

    const prompt = `You are the PAIOS Master Financial Advisor & Wealth Strategist.
Analyze the user's monthly budget and spending parameters:
- Monthly Inflow / Salary: ${profile.currency}${profile.monthlySalary}
- Fixed Obligations (Needs): ${profile.currency}${analysis.totalFixedObligations} (${analysis.needsRatio}%)
  - Food: ${profile.currency}${profile.foodMonthly}
  - Travel: ${profile.currency}${profile.travelMonthly}
  - Housing/Rent: ${profile.currency}${profile.housingMonthly}
  - Health: ${profile.currency}${profile.healthMonthly}
  - Debt/Loans: ${profile.currency}${profile.loanClearanceMonthly}
- Planned Investments & Savings: ${profile.currency}${analysis.totalPlannedInvestments} (${analysis.savingsRatio}%)
- Discretionary Free Capital: ${profile.currency}${analysis.totalFreeMoney} (${analysis.wantsRatio}%)
- Daily Safe-to-Spend: ${profile.currency}${analysis.safeToSpendDaily}
- Budget Health Score: ${analysis.budgetHealthScore}/100
- Days Remaining in Current Cycle: ${analysis.daysRemainingInCycle} days

Provide a concise, 3-point actionable strategic optimization plan to maximize daily savings, reduce obligations, and accelerate 5-year wealth growth. Format with bullet points.`;

    try {
      const response = await sendClientGeminiChat({ userText: prompt });
      setAiAdvice(response.text);
    } catch (err) {
      setAiAdvice(
        `1. Maintain your daily spend below ${profile.currency}${analysis.safeToSpendDaily.toFixed(2)} to ensure end-of-month surplus.\n2. Automate a ${profile.currency}${profile.investingMonthly} monthly SIP into diversified index funds.\n3. Sweep any daily unspent surplus every night to compound extra returns.`
      );
    } finally {
      setIsAnalyzingWithAi(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (selectedFilterCategory === 'ALL') return true;
    return t.category === selectedFilterCategory;
  });

  return (
    <div className="space-y-6 pb-12 animate-fade-in max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-indigo-500/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 text-white shadow-xl shadow-emerald-500/20 shrink-0">
            <Wallet className="w-8 h-8 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-heading font-extrabold text-xl text-white">
                Money Manager & Budget Analyzer
              </h2>
              <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-300" /> Pro Engine
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Real-time daily safe-to-spend tracking, obligation management, and compound wealth projections
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 relative z-10 shrink-0">
          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Log Expense</span>
          </button>

          <button
            onClick={() => setShowSetupModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Edit Plan</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Monthly Salary & Cycle Progress */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Monthly Income</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            {profile.currency}{Number(profile.monthlySalary).toLocaleString()}
          </div>
          <div className="text-[11px] text-cyan-300 font-mono flex items-center gap-1">
            <span>Cycle Day {profile.salaryCycleDay}</span>
            <span className="text-slate-600">•</span>
            <span>{analysis.daysRemainingInCycle} days left</span>
          </div>
        </div>

        {/* 2. Safe-to-Spend Today */}
        <div
          className={`border p-4 rounded-2xl shadow-lg space-y-2 ${
            todaySurplusInfo.isOverBudget
              ? 'bg-rose-950/40 border-rose-600/50'
              : 'bg-emerald-950/40 border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-white">Safe-to-Spend Today</span>
            <Zap className={`w-4 h-4 ${todaySurplusInfo.isOverBudget ? 'text-rose-400' : 'text-amber-300 fill-amber-300'}`} />
          </div>
          <div
            className={`text-xl font-extrabold font-mono ${
              todaySurplusInfo.isOverBudget ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {profile.currency}{todaySurplusInfo.surplusAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-300 font-mono">
            Spent {profile.currency}{todaySurplusInfo.actualSpend.toFixed(2)} of {profile.currency}{todaySurplusInfo.dailyBudget.toFixed(2)}
          </div>
        </div>

        {/* 3. Safe-to-Spend This Week */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Safe Weekly Budget</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-extrabold text-cyan-300 font-mono">
            {profile.currency}{analysis.safeToSpendWeekly.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Rolling 7-day discretionary limit
          </div>
        </div>

        {/* 4. Ideal Daily Savings Target */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Daily Wealth Target</span>
            <PiggyBank className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl font-extrabold text-teal-300 font-mono">
            {profile.currency}{analysis.idealDailySavings.toFixed(2)} / day
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">
            {profile.currency}{analysis.totalPlannedInvestments.toLocaleString()} monthly allocation
          </div>
        </div>
      </div>

      {/* Daily Surplus Sweep & End-of-Day Vault Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/70 border border-emerald-500/40 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
            <PiggyBank className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-base text-white">
                End-of-Day Leftover Sweep
              </h3>
              {isTodayAlreadySwept ? (
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Swept Today
                </span>
              ) : (
                <span className="text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full">
                  Pending Sweep
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Unspent allowance today: <strong className="text-emerald-400 font-mono">{profile.currency}{todaySurplusInfo.surplusAmount.toFixed(2)}</strong>. Sweep it into your wealth growth vault!
            </p>
          </div>
        </div>

        <button
          onClick={handleSweepDailySurplus}
          disabled={isTodayAlreadySwept || todaySurplusInfo.surplusAmount <= 0}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all shrink-0 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{isTodayAlreadySwept ? 'Swept to Savings Vault' : 'Sweep Remaining to Savings'}</span>
        </button>
      </div>

      {/* 50/30/20 Budget Health Audit Card & AI Strategy */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <PieChart className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-base text-white">
                  Budget Health Score & Ratios (50/30/20)
                </h3>
                <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full">
                  Score: {analysis.budgetHealthScore}/100
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Proportion of Needs, Discretionary Wants, and Wealth Investments
              </p>
            </div>
          </div>

          <button
            onClick={handleAiFinancialAudit}
            disabled={isAnalyzingWithAi}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 shrink-0"
          >
            <Bot className={`w-4 h-4 ${isAnalyzingWithAi ? 'animate-spin' : 'text-amber-300'}`} />
            <span>{isAnalyzingWithAi ? 'Analyzing Strategy...' : 'AI Financial Audit'}</span>
          </button>
        </div>

        {/* 3 Proportional Metric Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Needs */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Fixed Obligations (Needs)</span>
              <strong className="text-amber-400 font-mono">{analysis.needsRatio}%</strong>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full"
                style={{ width: `${Math.min(100, analysis.needsRatio)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              {profile.currency}{analysis.totalFixedObligations.toLocaleString()} (Target &le; 50%)
            </span>
          </div>

          {/* Wants */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Free Capital (Wants)</span>
              <strong className="text-cyan-400 font-mono">{analysis.wantsRatio}%</strong>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full"
                style={{ width: `${Math.min(100, analysis.wantsRatio)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              {profile.currency}{analysis.totalFreeMoney.toLocaleString()} (Target &le; 30%)
            </span>
          </div>

          {/* Savings */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Investments & Savings</span>
              <strong className="text-emerald-400 font-mono">{analysis.savingsRatio}%</strong>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full"
                style={{ width: `${Math.min(100, analysis.savingsRatio)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 block">
              {profile.currency}{analysis.totalPlannedInvestments.toLocaleString()} (Target &ge; 20%)
            </span>
          </div>
        </div>

        {/* AI Recommendations Box */}
        {aiAdvice && (
          <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/40 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
              <Bot className="w-4 h-4 text-purple-400" />
              <span>Gemini Wealth Strategic Insights:</span>
            </div>
            <div className="text-xs text-slate-200 whitespace-pre-line leading-relaxed pl-1 font-mono">
              {aiAdvice}
            </div>
          </div>
        )}
      </div>

      {/* Projected Wealth & Compound Growth Interactive Chart */}
      <ProjectedGrowthChart
        profile={profile}
        averageDailySurplus={avgSurplus}
      />

      {/* Recent Expense Transactions & Quick Entry */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
              <span>Expense History & Daily Outflows</span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                {transactions.length} records
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Track daily expenses to accurately compute your daily leftover surplus
            </p>
          </div>

          {/* Filter Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
            {['ALL', 'Food', 'Travel', 'Health', 'Housing', 'Learning', 'Entertainment'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedFilterCategory === cat
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
            <p className="text-xs text-slate-400">No expense records found for this filter.</p>
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              + Log your first daily expense
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden">
            {filteredTransactions.slice(0, 15).map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{tx.title}</h4>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                        {tx.category}
                      </span>
                      <span>{tx.dateString}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-white">
                    -{profile.currency}{tx.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDeleteExpense(tx.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Wizard Modal */}
      <BudgetSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        initialProfile={profile}
        onSaveProfile={handleSaveProfile}
      />

      {/* Log Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-400" />
                <span>Log Daily Expense</span>
              </h3>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Expense Title</label>
                <input
                  type="text"
                  required
                  value={newExpenseTitle}
                  onChange={(e) => setNewExpenseTitle(e.target.value)}
                  placeholder="e.g. Lunch with colleagues, Metro fare"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs">{profile.currency}</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={newExpenseAmount}
                      onChange={(e) => setNewExpenseAmount(e.target.value)}
                      placeholder="25.00"
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Category</label>
                  <select
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value as BudgetCategory)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Food">Food</option>
                    <option value="Travel">Travel</option>
                    <option value="Health">Health</option>
                    <option value="Housing">Housing</option>
                    <option value="Learning">Learning</option>
                    <option value="Investing">Investing</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function XIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
