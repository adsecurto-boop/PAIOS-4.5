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
  ArrowDownLeft,
  Filter,
  CreditCard,
  Users,
  Percent,
  Download,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  BarChart3,
  Scale,
  RotateCcw,
} from 'lucide-react';
import {
  BudgetProfile,
  ExpenseTransaction,
  DailySurplusRecord,
  BudgetCategory,
  BudgetRecoveryState,
  VarianceStatus,
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
  const [recoveryState, setRecoveryState] = useState<BudgetRecoveryState>(() =>
    PAIOSStorage.getBudgetRecoveryState()
  );

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportRange, setExportRange] = useState<'CURRENT_MONTH' | 'LAST_30_DAYS' | 'ALL'>('CURRENT_MONTH');
  const [exportFormat, setExportFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ALL');
  const [selectedLedgerType, setSelectedLedgerType] = useState<'ALL' | 'INFLOW' | 'OUTFLOW'>('ALL');
  const [activeTimelineTab, setActiveTimelineTab] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  // Quick Transaction Form State
  const [txType, setTxType] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState<BudgetCategory>('Food');
  const [txDate, setTxDate] = useState(() => getTodayDateString());
  const [txNotes, setTxNotes] = useState('');
  const [txIsNecessity, setTxIsNecessity] = useState(true);

  // Shift Surplus Form State
  const [shiftFromCategory, setShiftFromCategory] = useState<BudgetCategory>('Entertainment');
  const [shiftToCategory, setShiftToCategory] = useState<BudgetCategory>('Food');
  const [shiftAmount, setShiftAmount] = useState('50');

  // AI Financial Advisor State
  const [isAnalyzingWithAi, setIsAnalyzingWithAi] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);

  // Today Date & Computations
  const todayStr = getTodayDateString();
  const analysis = MoneyManagerPlugin.analyzeBudget(profile, transactions, new Date());
  const todayNetMetrics = MoneyManagerPlugin.calculateDailyNetSavings(transactions, todayStr);
  const todaySurplusInfo = MoneyManagerPlugin.calculateDailySurplus(profile, transactions, todayStr);
  const plannedVsActual = MoneyManagerPlugin.calculatePlannedVsActual(profile, transactions, new Date());
  const evaluatedRecovery = MoneyManagerPlugin.evaluateLossRecovery(profile, transactions, new Date(), recoveryState);

  // Calculate moving average surplus for projection
  const totalSweptAllTime = surpluses.reduce((acc, s) => acc + (s.sweptAmount || 0), 0);
  const avgSurplus = surpluses.length > 0 ? totalSweptAllTime / surpluses.length : todaySurplusInfo.surplusAmount * 0.7;

  // Realtime storage synchronization listener
  useEffect(() => {
    const handleStorageChange = () => {
      setProfile(PAIOSStorage.getBudgetProfile());
      setTransactions(PAIOSStorage.getExpenseTransactions());
      setSurpluses(PAIOSStorage.getDailySurpluses());
      setRecoveryState(PAIOSStorage.getBudgetRecoveryState());
    };
    window.addEventListener('paios_storage_change', handleStorageChange);
    return () => window.removeEventListener('paios_storage_change', handleStorageChange);
  }, []);

  // Staging telemetry to PIT for AI agent
  useEffect(() => {
    MoneyManagerPlugin.stageBudgetTelemetryToPIT(profile, analysis);
  }, [profile, transactions, recoveryState]);

  const handleSaveProfile = (updated: BudgetProfile) => {
    setProfile(updated);
    PAIOSStorage.saveBudgetProfile(updated);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txTitle.trim() || !txAmount) return;

    const amt = Math.max(0.01, Number(txAmount));
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const tx: ExpenseTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: txTitle.trim(),
      amount: amt,
      type: txType,
      category: txCategory,
      dateString: txDate || todayStr,
      timeString,
      timestampMillis: Date.now(),
      isNecessity: txType === 'OUTFLOW' ? txIsNecessity : false,
      notes: txNotes.trim() || undefined,
    };

    PAIOSStorage.saveExpenseTransaction(tx);
    setTransactions(PAIOSStorage.getExpenseTransactions());

    // Reset form
    setTxTitle('');
    setTxAmount('');
    setTxNotes('');
    setShowAddTransactionModal(false);
  };

  const handleDeleteTransaction = (id: string) => {
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

    // Update savings balance in profile
    const updatedProfile: BudgetProfile = {
      ...profile,
      currentSaved: (profile.currentSaved || 0) + todaySurplusInfo.surplusAmount,
      updatedAtMillis: Date.now(),
    };

    PAIOSStorage.saveDailySurplus(record);
    PAIOSStorage.saveBudgetProfile(updatedProfile);
    setSurpluses(PAIOSStorage.getDailySurpluses());
    setProfile(updatedProfile);
  };

  const isTodayAlreadySwept = surpluses.some((s) => s.dateString === todayStr);

  // Recovery Arbiter Action Handlers
  const handleApplyDailySpendAdjustment = () => {
    const { updatedProfile, updatedRecovery } = MoneyManagerPlugin.applyRecoveryAdjustment(
      profile,
      evaluatedRecovery
    );
    PAIOSStorage.saveBudgetProfile(updatedProfile);
    PAIOSStorage.saveBudgetRecoveryState(updatedRecovery);
    setProfile(updatedProfile);
    setRecoveryState(updatedRecovery);
  };

  const handleShiftCategorySurplus = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(shiftAmount);
    if (!amt || amt <= 0) return;

    const updatedProfile = MoneyManagerPlugin.shiftCategorySurplus(
      profile,
      shiftFromCategory,
      shiftToCategory,
      amt
    );

    const updatedRecovery: BudgetRecoveryState = {
      ...evaluatedRecovery,
      shiftedSurplusHistory: [
        ...(recoveryState.shiftedSurplusHistory || []),
        {
          fromCategory: shiftFromCategory,
          toCategory: shiftToCategory,
          amount: amt,
          timestampMillis: Date.now(),
        },
      ],
      status: 'ADJUSTED',
      updatedAtMillis: Date.now(),
    };

    PAIOSStorage.saveBudgetProfile(updatedProfile);
    PAIOSStorage.saveBudgetRecoveryState(updatedRecovery);
    setProfile(updatedProfile);
    setRecoveryState(updatedRecovery);
    setShowShiftModal(false);
  };

  const handleResetRecovery = () => {
    const updatedProfile: BudgetProfile = {
      ...profile,
      appliedRecoveryAdjustment: 0,
      updatedAtMillis: Date.now(),
    };
    const updatedRecovery: BudgetRecoveryState = {
      activeBreach: false,
      overageAmount: 0,
      daysRemaining: 1,
      dailyReductionQuota: 0,
      appliedDailyAdjustment: 0,
      status: 'RESOLVED',
      updatedAtMillis: Date.now(),
    };
    PAIOSStorage.saveBudgetProfile(updatedProfile);
    PAIOSStorage.saveBudgetRecoveryState(updatedRecovery);
    setProfile(updatedProfile);
    setRecoveryState(updatedRecovery);
  };

  // Client-Side CSV & Excel Exports
  const handleExportCSV = (range: 'CURRENT_MONTH' | 'LAST_30_DAYS' | 'ALL' = exportRange) => {
    const csvData = MoneyManagerPlugin.exportToCSV(transactions, profile.currency, range);
    MoneyManagerPlugin.downloadFile(
      csvData,
      `PAIOS_Financial_Ledger_${range.toLowerCase()}_${todayStr}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportExcel = (range: 'CURRENT_MONTH' | 'LAST_30_DAYS' | 'ALL' = exportRange) => {
    const excelXml = MoneyManagerPlugin.exportToExcel(transactions, profile, analysis, range);
    MoneyManagerPlugin.downloadFile(
      excelXml,
      `PAIOS_Wealth_Analytics_${range.toLowerCase()}_${todayStr}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportLedger = () => {
    if (exportFormat === 'CSV') {
      handleExportCSV(exportRange);
    } else {
      handleExportExcel(exportRange);
    }
    setShowExportModal(false);
  };

  // Trigger Gemini AI Financial Consultation
  const handleAiFinancialAudit = async () => {
    setIsAnalyzingWithAi(true);
    setAiAdvice(null);

    const prompt = `You are the PAIOS Master Financial Advisor & Wealth Strategist.
Analyze the user's comprehensive wealth, dual cashflow, and recovery profile:
- Monthly Income: ${profile.currency}${profile.monthlySalary} (Variable Streams: +${profile.currency}${profile.expectedVariableIncome || 0})
- Net Worth: ${profile.currency}${analysis.netWorth?.toLocaleString()}
- Total Assets: ${profile.currency}${analysis.totalAssets?.toLocaleString()} (Checking: ${profile.currency}${profile.currentBalance || 0}, Savings: ${profile.currency}${profile.currentSaved || 0}, Invested: ${profile.currency}${profile.currentInvested || 0})
- Outstanding Debt: ${profile.currency}${profile.currentDebt || 0} (Interest Rate: ${profile.debtInterestRate || 12}% p.a.)
- Fixed Obligations (Needs): ${profile.currency}${analysis.totalFixedObligations} (${analysis.needsRatio}%)
- Discretionary Free Capital: ${profile.currency}${analysis.totalFreeMoney} (${analysis.wantsRatio}%)
- Daily Safe-to-Spend Cap: ${profile.currency}${analysis.safeToSpendDaily} (Effective with recovery: ${profile.currency}${analysis.effectiveDailyBudget})
- Today's Inflows: +${profile.currency}${todayNetMetrics.totalInflow.toFixed(2)} | Outflows: -${profile.currency}${todayNetMetrics.totalOutflow.toFixed(2)} | Net Saved: ${profile.currency}${todayNetMetrics.netSaved.toFixed(2)}
- Active Loss Recovery: ${evaluatedRecovery.activeBreach ? `BREACH DETECTED (${profile.currency}${evaluatedRecovery.overageAmount} overage). ${evaluatedRecovery.tradeOffSuggestion}` : 'On Track'}

Provide a concise, 4-point actionable strategic optimization plan to eliminate debt, optimize family obligations, maximize daily savings, and accelerate 5-year investment growth. Format with clean bullet points.`;

    try {
      const userSettings = PAIOSStorage.getSettings();
      const response = await sendClientGeminiChat({
        userText: prompt,
        customApiKey: userSettings?.customApiKey,
        modelName: userSettings?.preferredModel,
      });
      setAiAdvice(response.text);
    } catch (err: any) {
      setAiAdvice(
        `1. Maintain your daily spend below ${profile.currency}${analysis.effectiveDailyBudget?.toFixed(2)} to ensure end-of-month surplus.\n2. Prioritize high-interest debt clearance (${profile.debtInterestRate || 12}%) to save on interest costs.\n3. Automate your monthly ${profile.currency}${profile.investingMonthly} SIP into diversified index funds.\n4. Sweep any daily unspent surplus every night to compound extra returns.`
      );
    } finally {
      setIsAnalyzingWithAi(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (selectedLedgerType !== 'ALL') {
      const type = t.type === 'INFLOW' ? 'INFLOW' : 'OUTFLOW';
      if (type !== selectedLedgerType) return false;
    }
    if (selectedFilterCategory === 'ALL') return true;
    return t.category === selectedFilterCategory;
  });

  const getVarianceBadge = (status: VarianceStatus, variance: number, currency: string) => {
    if (status === 'OVER_BUDGET') {
      return (
        <span className="text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>Over Budget (-{currency}{Math.abs(variance).toFixed(2)})</span>
        </span>
      );
    }
    if (status === 'APPROACHING_LIMIT') {
      return (
        <span className="text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-amber-400" />
          <span>Approaching Limit (85%+) ({currency}{variance.toFixed(2)} left)</span>
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded-full flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span>Within Target (+{currency}{variance.toFixed(2)})</span>
      </span>
    );
  };

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
                Money Manager &amp; Budget Analyzer Pro
              </h2>
              <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-300" /> Pro Wealth Engine v4.5.7
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Multi-stream cashflow, daily net savings, automated loss recovery, and planned-vs-actual multi-timeline analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 relative z-10 shrink-0 flex-wrap">
          <button
            onClick={() => {
              setTxType('INFLOW');
              setShowAddTransactionModal(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition-all"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Inflow</span>
          </button>

          <button
            onClick={() => {
              setTxType('OUTFLOW');
              setShowAddTransactionModal(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>- Outflow</span>
          </button>

          <button
            onClick={() => setShowSetupModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Plan Wizard</span>
          </button>
        </div>
      </div>

      {/* Balance Sheet & Net Worth Overview Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-cyan-400" />
            <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
              Current Balance Sheet &amp; Wealth Position
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Net Worth:</span>
            <strong
              className={`text-sm font-extrabold font-mono px-2.5 py-0.5 rounded-lg border ${
                (analysis.netWorth || 0) >= 0
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                  : 'bg-rose-950 text-rose-300 border-rose-700/50'
              }`}
            >
              {profile.currency}{(analysis.netWorth || 0).toLocaleString()}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 font-mono block">Liquid / Checking</span>
            <strong className="text-base font-extrabold text-white font-mono">
              {profile.currency}{(profile.currentBalance || 0).toLocaleString()}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">Available Cash</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-teal-500/20">
            <span className="text-[10px] text-teal-400 font-mono block">Emergency Savings</span>
            <strong className="text-base font-extrabold text-teal-300 font-mono">
              {profile.currency}{(profile.currentSaved || 0).toLocaleString()}
            </strong>
            <span className="text-[10px] text-teal-500/80 block mt-0.5">Yield: {profile.savingsInterestRate || 4}% p.a.</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/20">
            <span className="text-[10px] text-emerald-400 font-mono block">Invested Portfolio</span>
            <strong className="text-base font-extrabold text-emerald-300 font-mono">
              {profile.currency}{(profile.currentInvested || 0).toLocaleString()}
            </strong>
            <span className="text-[10px] text-emerald-500/80 block mt-0.5">CAGR: {profile.expectedAnnualReturnRate || 10}% p.a.</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-orange-500/20">
            <span className="text-[10px] text-orange-400 font-mono block">Outstanding Debt</span>
            <strong className="text-base font-extrabold text-rose-400 font-mono">
              {profile.currency}{(profile.currentDebt || 0).toLocaleString()}
            </strong>
            <span className="text-[10px] text-orange-400/80 block mt-0.5">Rate: {profile.debtInterestRate || 12}% p.a.</span>
          </div>
        </div>
      </div>

      {/* Daily Cashflow & Net Savings KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Received Today */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5" /> Received Today
            </span>
            <span className="text-[10px] font-mono text-slate-500">Inflows</span>
          </div>
          <div className="text-xl font-extrabold text-emerald-300 font-mono">
            +{profile.currency}{todayNetMetrics.totalInflow.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Side income, dividends &amp; transfers
          </div>
        </div>

        {/* 2. Spent Today */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-rose-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> Spent Today
            </span>
            <span className="text-[10px] font-mono text-slate-500">Outflows</span>
          </div>
          <div className="text-xl font-extrabold text-rose-300 font-mono">
            -{profile.currency}{todayNetMetrics.totalOutflow.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Safe Cap: {profile.currency}{(analysis.effectiveDailyBudget || analysis.safeToSpendDaily).toFixed(2)}
          </div>
        </div>

        {/* 3. Saved Today (Net) */}
        <div
          className={`border p-4 rounded-2xl shadow-lg space-y-2 ${
            todayNetMetrics.netSaved >= 0
              ? 'bg-emerald-950/40 border-emerald-500/40'
              : 'bg-rose-950/40 border-rose-600/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-white flex items-center gap-1">
              <PiggyBank className="w-3.5 h-3.5 text-teal-400" /> Saved Today (Net)
            </span>
            <span className="text-[10px] font-mono font-bold text-teal-300">Inflow - Outflow</span>
          </div>
          <div
            className={`text-xl font-extrabold font-mono ${
              todayNetMetrics.netSaved >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {todayNetMetrics.netSaved >= 0 ? '+' : ''}{profile.currency}{todayNetMetrics.netSaved.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-300 font-mono">
            Unspent Allowance: {profile.currency}{todaySurplusInfo.unspentAllowance.toFixed(2)}
          </div>
        </div>

        {/* 4. Safe-to-Spend Today (Effective) */}
        <div
          className={`border p-4 rounded-2xl shadow-lg space-y-2 ${
            todaySurplusInfo.isOverBudget
              ? 'bg-rose-950/40 border-rose-600/50'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-white flex items-center gap-1">
              <Zap className={`w-3.5 h-3.5 ${todaySurplusInfo.isOverBudget ? 'text-rose-400' : 'text-amber-300 fill-amber-300'}`} />
              Safe-to-Spend Today
            </span>
            {analysis.appliedDailyAdjustment && analysis.appliedDailyAdjustment > 0 ? (
              <span className="text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.2 rounded">
                -{profile.currency}{analysis.appliedDailyAdjustment}/d cut
              </span>
            ) : null}
          </div>
          <div
            className={`text-xl font-extrabold font-mono ${
              todaySurplusInfo.isOverBudget ? 'text-rose-400' : 'text-cyan-300'
            }`}
          >
            {profile.currency}{todaySurplusInfo.unspentAllowance.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
            <span>Cycle Day {profile.salaryCycleDay}</span>
            <span>{analysis.daysRemainingInCycle} days left</span>
          </div>
        </div>
      </div>

      {/* Automated "Loss-to-Expense" Recovery Arbiter Card */}
      {(evaluatedRecovery.activeBreach || (profile.appliedRecoveryAdjustment && profile.appliedRecoveryAdjustment > 0)) && (
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-indigo-950/80 border border-rose-500/50 rounded-3xl p-5 shadow-2xl space-y-4 animate-fade-in relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                <Scale className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-base text-white">
                    Automated &ldquo;Loss-to-Expense&rdquo; Recovery Arbiter
                  </h3>
                  <span className="text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    {profile.appliedRecoveryAdjustment ? 'Adjustment Applied' : 'Breach Detected'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Identified {profile.currency}{evaluatedRecovery.overageAmount.toFixed(2)} overage in {evaluatedRecovery.breachedCategory || 'Daily Spend'}. Recovery quota: <strong className="text-rose-300 font-mono">{profile.currency}{evaluatedRecovery.dailyReductionQuota.toFixed(2)}/day</strong> across remaining {evaluatedRecovery.daysRemaining} days.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={handleApplyDailySpendAdjustment}
                className="px-4 py-2 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Apply Daily Spend Adjustment</span>
              </button>

              <button
                onClick={() => setShowShiftModal(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
              >
                <Scale className="w-3.5 h-3.5 text-cyan-400" />
                <span>Rebalance From Surplus</span>
              </button>

              {profile.appliedRecoveryAdjustment ? (
                <button
                  onClick={handleResetRecovery}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl"
                  title="Reset Recovery"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>

          {evaluatedRecovery.tradeOffSuggestion && (
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{evaluatedRecovery.tradeOffSuggestion}</span>
            </div>
          )}
        </div>
      )}

      {/* Planned vs. Actual Multi-Timeline Analytics Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <BarChart3 className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white">
                Planned vs. Actual Budget &amp; Multi-Timeline Analytics
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Variance monitoring across Daily safe-caps, Rolling weekly targets, and Monthly 50/30/20 limits
              </p>
            </div>
          </div>

          {/* Timeline Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTimelineTab('daily')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTimelineTab === 'daily'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Daily Safe-Cap
            </button>
            <button
              onClick={() => setActiveTimelineTab('weekly')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTimelineTab === 'weekly'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rolling 7-Day
            </button>
            <button
              onClick={() => setActiveTimelineTab('monthly')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTimelineTab === 'monthly'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly 50/30/20
            </button>
          </div>
        </div>

        {/* Tab 1: Daily Safe-Cap */}
        {activeTimelineTab === 'daily' && (
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-semibold">Today&rsquo;s Safe-to-Spend Cap</span>
              {getVarianceBadge(
                plannedVsActual.daily.status,
                plannedVsActual.daily.variance,
                profile.currency
              )}
            </div>
            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  plannedVsActual.daily.status === 'OVER_BUDGET'
                    ? 'bg-rose-500'
                    : plannedVsActual.daily.status === 'APPROACHING_LIMIT'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    plannedVsActual.daily.safeCap > 0
                      ? (plannedVsActual.daily.actualSpent / plannedVsActual.daily.safeCap) * 100
                      : 100
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Spent: {profile.currency}{plannedVsActual.daily.actualSpent.toFixed(2)}</span>
              <span>Safe Cap: {profile.currency}{plannedVsActual.daily.safeCap.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Tab 2: Rolling 7-Day */}
        {activeTimelineTab === 'weekly' && (
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-semibold">Rolling 7-Day Discretionary Limit</span>
              {getVarianceBadge(
                plannedVsActual.weekly.status,
                plannedVsActual.weekly.variance,
                profile.currency
              )}
            </div>
            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  plannedVsActual.weekly.status === 'OVER_BUDGET'
                    ? 'bg-rose-500'
                    : plannedVsActual.weekly.status === 'APPROACHING_LIMIT'
                    ? 'bg-amber-400'
                    : 'bg-cyan-400'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    plannedVsActual.weekly.rollingCap > 0
                      ? (plannedVsActual.weekly.actualSpent / plannedVsActual.weekly.rollingCap) * 100
                      : 100
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>7-Day Outflow: {profile.currency}{plannedVsActual.weekly.actualSpent.toFixed(2)}</span>
              <span>Rolling Cap: {profile.currency}{plannedVsActual.weekly.rollingCap.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Tab 3: Monthly Breakdown by Category */}
        {activeTimelineTab === 'monthly' && (
          <div className="space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Needs */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">Needs Spent vs Planned</span>
                <strong className="text-sm font-bold text-amber-300 font-mono">
                  {profile.currency}{plannedVsActual.monthly.needsActual.toLocaleString()} / {profile.currency}{plannedVsActual.monthly.needsPlanned.toLocaleString()}
                </strong>
              </div>

              {/* Wants */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">Wants Spent vs Planned</span>
                <strong className="text-sm font-bold text-cyan-300 font-mono">
                  {profile.currency}{plannedVsActual.monthly.wantsActual.toLocaleString()} / {profile.currency}{plannedVsActual.monthly.wantsPlanned.toLocaleString()}
                </strong>
              </div>

              {/* Savings */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">Invest/Save vs Target</span>
                <strong className="text-sm font-bold text-emerald-400 font-mono">
                  {profile.currency}{plannedVsActual.monthly.savingsActual.toLocaleString()} / {profile.currency}{plannedVsActual.monthly.savingsPlanned.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Category Variance Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {plannedVsActual.monthly.categories.map((cat) => (
                <div
                  key={cat.category}
                  className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">
                      {cat.category === 'FamilyContribution' ? 'Family Support' : cat.category}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        cat.status === 'OVER_BUDGET'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : cat.status === 'APPROACHING_LIMIT'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {cat.percentUsed}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cat.status === 'OVER_BUDGET'
                          ? 'bg-rose-500'
                          : cat.status === 'APPROACHING_LIMIT'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, cat.percentUsed)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Spent: {profile.currency}{cat.actual}</span>
                    <span>Plan: {profile.currency}{cat.planned}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
              Net unspent allowance + positive savings: <strong className="text-emerald-400 font-mono">{profile.currency}{todaySurplusInfo.surplusAmount.toFixed(2)}</strong>. Sweep it into your wealth growth vault!
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
                  Budget Health Score &amp; Ratios (50/30/20)
                </h3>
                <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full">
                  Score: {analysis.budgetHealthScore}/100
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Proportion of Needs (including Family Support), Discretionary Wants, and Wealth Investments
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

      {/* Predictive Wealth & 3 Interactive Projections (Invested, Debt-Free, Savings) */}
      <ProjectedGrowthChart
        profile={profile}
        averageDailySurplus={avgSurplus}
      />

      {/* Dual Inflow / Outflow Transaction History & Client-Side Export */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
              <span>Dual Inflow/Outflow Ledger History</span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                {transactions.length} records
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-stream incomes, daily expenses, and client-side ledger exports
            </p>
          </div>

          {/* Export Ledger Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              disabled={transactions.length === 0}
              className="px-3.5 py-2 bg-gradient-to-r from-slate-800 to-indigo-950/80 hover:from-slate-700 hover:to-indigo-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl border border-indigo-500/40 flex items-center gap-1.5 shadow-lg shadow-indigo-900/20 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export Ledger</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          {/* Type Filter */}
          <div className="flex items-center gap-1 text-xs font-semibold">
            {(['ALL', 'INFLOW', 'OUTFLOW'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedLedgerType(type)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedLedgerType === type
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {type === 'ALL' ? 'All Types' : type === 'INFLOW' ? '+ Inflows' : '- Outflows'}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
            {[
              'ALL',
              'Food',
              'Travel',
              'Health',
              'Housing',
              'FamilyContribution',
              'LoanClearance',
              'Learning',
              'Entertainment',
              'Freelance',
              'SideCash',
              'Dividends',
            ].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedFilterCategory === cat
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {cat === 'FamilyContribution' ? 'Family Support' : cat === 'LoanClearance' ? 'Loan / EMI' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
            <p className="text-xs text-slate-400">No transactions found for this filter.</p>
            <button
              onClick={() => {
                setTxType('OUTFLOW');
                setShowAddTransactionModal(true);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              + Log your first transaction
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden">
            {filteredTransactions.slice(0, 20).map((tx) => {
              const isInflow = tx.type === 'INFLOW';
              return (
                <div
                  key={tx.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl border ${
                        isInflow
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-900 border-slate-800 text-cyan-400'
                      }`}
                    >
                      {isInflow ? <ArrowDownLeft className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{tx.title}</span>
                        {tx.notes && (
                          <span className="text-[10px] text-slate-500 font-normal truncate max-w-xs">
                            ({tx.notes})
                          </span>
                        )}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                          {tx.category === 'FamilyContribution' ? 'Family Support' : tx.category}
                        </span>
                        <span>{tx.dateString}</span>
                        {tx.timeString && <span>{tx.timeString}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono font-bold text-sm ${
                        isInflow ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {isInflow ? '+' : '-'}{profile.currency}{Number(tx.amount).toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete transaction"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
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

      {/* Log Inflow/Outflow Modal */}
      {showAddTransactionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                {txType === 'INFLOW' ? (
                  <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                ) : (
                  <DollarSign className="w-5 h-5 text-cyan-400" />
                )}
                <span>Log {txType === 'INFLOW' ? 'Income / Inflow' : 'Expense / Outflow'}</span>
              </h3>
              <button
                onClick={() => setShowAddTransactionModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Inflow vs Outflow Segmented Pill Toggle */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setTxType('INFLOW');
                  setTxCategory('FREELANCE');
                }}
                className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  txType === 'INFLOW'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>+ Log Money Received / Inflow</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTxType('OUTFLOW');
                  setTxCategory('FOOD');
                }}
                className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  txType === 'OUTFLOW'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>- Log Expense / Outflow</span>
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {txType === 'INFLOW' ? 'Source / Title' : 'Expense Title'}
                </label>
                <input
                  type="text"
                  required
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  placeholder={
                    txType === 'INFLOW'
                      ? 'e.g. Freelance project, Dividend payout, Cashback'
                      : 'e.g. Lunch with colleagues, Family transfer, Metro fare'
                  }
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
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      placeholder="25.00"
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Category</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value as BudgetCategory)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {txType === 'INFLOW' ? (
                      <>
                        <option value="SALARY">Salary / Primary Pay</option>
                        <option value="FREELANCE">Freelance / Consulting</option>
                        <option value="GIFT">Gift / Bonus</option>
                        <option value="DIVIDEND">Dividend / Investment Yield</option>
                        <option value="DAILY_CASH">Daily Cash / Side Hustle</option>
                        <option value="OTHER_INCOME">Other Income</option>
                      </>
                    ) : (
                      <>
                        <option value="FOOD">Food &amp; Groceries</option>
                        <option value="TRAVEL">Travel, Fuel &amp; Transit</option>
                        <option value="HEALTH">Health, Meds &amp; Doctor</option>
                        <option value="HOUSING">Housing, Rent &amp; Utilities</option>
                        <option value="LOAN_EMI">Loan Clearance / EMI</option>
                        <option value="FAMILY_SUPPORT">Family Support &amp; Parents</option>
                        <option value="LEARNING">Learning, Courses &amp; Books</option>
                        <option value="ENTERTAINMENT">Entertainment &amp; Dining</option>
                        <option value="MISC">Miscellaneous / Other</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Notes / Remarks</label>
                  <input
                    type="text"
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    placeholder="Optional memo"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTransactionModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Save {txType === 'INFLOW' ? 'Inflow' : 'Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client-Side Export Ledger Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-cyan-400" />
                <span>Export Financial Ledger</span>
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Generate private, RFC 4180 compliant CSV or Excel XLSX spreadsheets directly inside your browser with zero external network egress.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Date Range</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CURRENT_MONTH', 'LAST_30_DAYS', 'ALL'] as const).map((rng) => (
                    <button
                      key={rng}
                      type="button"
                      onClick={() => setExportRange(rng)}
                      className={`py-2 px-2 text-center rounded-xl text-xs font-semibold transition-all border ${
                        exportRange === rng
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {rng === 'CURRENT_MONTH' ? 'Current Month' : rng === 'LAST_30_DAYS' ? 'Last 30 Days' : 'All Records'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">File Format</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('CSV')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border ${
                      exportFormat === 'CSV'
                        ? 'bg-cyan-600 text-white border-cyan-500 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-cyan-300" />
                    <span>CSV (.csv)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('XLSX')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border ${
                      exportFormat === 'XLSX'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                    <span>Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                <div>Output Schema: Date, Time, Type, Title, Category, Amount, Running Daily Balance, Notes</div>
                <div className="text-emerald-400 font-bold">✓ 100% Private local generation (Zero network egress)</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportLedger}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {exportFormat}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Category Surplus Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-rose-400" />
                <span>Shift Category Surplus</span>
              </h3>
              <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-white">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Reallocate unspent monthly funds from a surplus category into an over-budget category to balance the cycle ledger.
            </p>

            <form onSubmit={handleShiftCategorySurplus} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">From Category (Surplus Source)</label>
                <select
                  value={shiftFromCategory}
                  onChange={(e) => setShiftFromCategory(e.target.value as BudgetCategory)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="Entertainment">Entertainment / Discretionary</option>
                  <option value="Food">Food &amp; Groceries</option>
                  <option value="Travel">Travel &amp; Fuel</option>
                  <option value="Learning">Learning</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">To Category (Over-Budget Destination)</label>
                <select
                  value={shiftToCategory}
                  onChange={(e) => setShiftToCategory(e.target.value as BudgetCategory)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="Food">Food &amp; Groceries</option>
                  <option value="Health">Health &amp; Meds</option>
                  <option value="Travel">Travel &amp; Commute</option>
                  <option value="Housing">Housing &amp; Utilities</option>
                  <option value="FamilyContribution">Family Support</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Amount to Shift ({profile.currency})</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={shiftAmount}
                  onChange={(e) => setShiftAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  Reallocate Surplus
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
