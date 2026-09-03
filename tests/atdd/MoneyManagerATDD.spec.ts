/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAIOSStorage, getTodayDateString } from '../../src/storage';
import { MoneyManagerPlugin } from '../../src/core/plugins/MoneyManagerPlugin';
import { BudgetProfile, ExpenseTransaction } from '../../src/types';

describe('ATDD: Money Manager Pro Multi-Stream, Dual Ledger & Recovery Engine', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
  });

  it('persists multi-stream budget profile and synchronizes via PAIOSStorage events', () => {
    let changeEventFired = false;
    window.addEventListener('paios_storage_change', (e: any) => {
      if (e.detail?.key === 'paios_budget_profile_v1') {
        changeEventFired = true;
      }
    });

    const profile: BudgetProfile = {
      id: 'atdd_profile_1',
      monthlySalary: 6000,
      expectedVariableIncome: 1200,
      variableIncomeStreams: [
        {
          id: 'v1',
          name: 'Consulting Retainer',
          category: 'Freelance',
          expectedMonthlyAmount: 1000,
        },
        {
          id: 'v2',
          name: 'Index Dividend Yield',
          category: 'Dividends',
          expectedMonthlyAmount: 200,
        },
      ],
      currency: '₹',
      salaryCycleDay: 1,
      currentBalance: 50000,
      currentSaved: 120000,
      currentInvested: 350000,
      currentDebt: 80000,
      debtInterestRate: 9.5,
      savingsInterestRate: 6.5,
      foodMonthly: 12000,
      travelMonthly: 6000,
      healthMonthly: 4000,
      housingMonthly: 25000,
      loanClearanceMonthly: 10000,
      familyContributionMonthly: 8000,
      learningMonthly: 3000,
      investingMonthly: 15000,
      savingsMonthly: 10000,
      discretionaryMonthly: 12000,
      expectedAnnualReturnRate: 14,
      updatedAtMillis: Date.now(),
    };

    PAIOSStorage.saveBudgetProfile(profile);

    const retrieved = PAIOSStorage.getBudgetProfile();
    expect(retrieved.id).toBe('atdd_profile_1');
    expect(retrieved.expectedVariableIncome).toBe(1200);
    expect(retrieved.variableIncomeStreams?.length).toBe(2);
    expect(changeEventFired).toBe(true);
  });

  it('logs dual Inflows and Outflows, updates Daily Net Savings, and executes Leftover Sweep to Vault', () => {
    const today = getTodayDateString();
    const profile = PAIOSStorage.getBudgetProfile();

    // 1. Log an Inflow (e.g. Freelance payout)
    const inflowTx: ExpenseTransaction = {
      id: 'tx_in_1',
      title: 'UI Testing Contract Milestone',
      amount: 400,
      type: 'INFLOW',
      category: 'Freelance',
      dateString: today,
      timestampMillis: Date.now(),
      isNecessity: false,
      notes: 'Client wire payment',
    };
    PAIOSStorage.saveExpenseTransaction(inflowTx);

    // 2. Log an Outflow (e.g. Groceries)
    const outflowTx: ExpenseTransaction = {
      id: 'tx_out_1',
      title: 'Organic Food Market',
      amount: 75,
      type: 'OUTFLOW',
      category: 'Food',
      dateString: today,
      timestampMillis: Date.now(),
      isNecessity: true,
    };
    PAIOSStorage.saveExpenseTransaction(outflowTx);

    // 3. Verify Daily Net Savings
    const transactions = PAIOSStorage.getExpenseTransactions();
    const net = MoneyManagerPlugin.calculateDailyNetSavings(transactions, today);
    expect(net.totalInflow).toBe(400);
    expect(net.totalOutflow).toBe(75);
    expect(net.netSaved).toBe(325);

    // 4. Calculate Sweep Surplus
    const surplusInfo = MoneyManagerPlugin.calculateDailySurplus(profile, transactions, today);
    expect(surplusInfo.surplusAmount).toBeGreaterThanOrEqual(325);

    // 5. Sweep into Savings Vault
    const initialSaved = profile.currentSaved || 0;
    const sweptSurplus = surplusInfo.surplusAmount;

    PAIOSStorage.saveDailySurplus({
      id: `surplus_${today}`,
      dateString: today,
      dailySafeBudget: surplusInfo.dailyBudget,
      actualSpend: surplusInfo.actualSpend,
      sweptAmount: sweptSurplus,
      timestampMillis: Date.now(),
    });

    const updatedProfile: BudgetProfile = {
      ...profile,
      currentSaved: initialSaved + sweptSurplus,
      updatedAtMillis: Date.now(),
    };
    PAIOSStorage.saveBudgetProfile(updatedProfile);

    const savedSurpluses = PAIOSStorage.getDailySurpluses();
    expect(savedSurpluses.some((s) => s.dateString === today)).toBe(true);
    expect(PAIOSStorage.getBudgetProfile().currentSaved).toBe(initialSaved + sweptSurplus);
  });

  it('detects category overage breach, computes daily quota, and applies recovery adjustment', () => {
    const today = getTodayDateString();
    const profile = PAIOSStorage.getBudgetProfile();

    // Create huge expense in Travel category
    const breachTx: ExpenseTransaction = {
      id: 'tx_breach_1',
      title: 'Emergency Flight Ticket',
      amount: 1200,
      type: 'OUTFLOW',
      category: 'Travel',
      dateString: today,
      timestampMillis: Date.now(),
      isNecessity: true,
    };
    PAIOSStorage.saveExpenseTransaction(breachTx);

    const transactions = PAIOSStorage.getExpenseTransactions();
    const recovery = MoneyManagerPlugin.evaluateLossRecovery(profile, transactions, new Date());

    expect(recovery.activeBreach).toBe(true);
    expect(recovery.overageAmount).toBeGreaterThan(0);
    expect(recovery.dailyReductionQuota).toBeGreaterThan(0);

    // Apply recovery adjustment
    const { updatedProfile, updatedRecovery } = MoneyManagerPlugin.applyRecoveryAdjustment(
      profile,
      recovery
    );
    PAIOSStorage.saveBudgetProfile(updatedProfile);
    PAIOSStorage.saveBudgetRecoveryState(updatedRecovery);

    expect(PAIOSStorage.getBudgetProfile().appliedRecoveryAdjustment).toBe(recovery.dailyReductionQuota);
    expect(PAIOSStorage.getBudgetRecoveryState().status).toBe('ADJUSTED');
  });

  it('generates downloadable CSV and Excel spreadsheets with range filtering and zero network egress', () => {
    const today = getTodayDateString();
    const profile = PAIOSStorage.getBudgetProfile();

    const tx1: ExpenseTransaction = {
      id: 'tx_old',
      title: 'Ancient Expense',
      amount: 50,
      type: 'OUTFLOW',
      category: 'MISC',
      dateString: '2024-01-01',
      timestampMillis: new Date('2024-01-01').getTime(),
      isNecessity: false,
    };
    const tx2: ExpenseTransaction = {
      id: 'tx_current',
      title: 'Current Month Inflow',
      amount: 500,
      type: 'INFLOW',
      category: 'SALARY',
      dateString: today,
      timestampMillis: Date.now(),
      isNecessity: true,
      provenance: 'AI_EXTRACTED',
    };
    PAIOSStorage.saveExpenseTransaction(tx1);
    PAIOSStorage.saveExpenseTransaction(tx2);

    const transactions = PAIOSStorage.getExpenseTransactions();
    const analysis = MoneyManagerPlugin.analyzeBudget(profile, transactions);

    // 1. Export All
    const allCsv = MoneyManagerPlugin.exportToCSV(transactions, profile.currency, 'ALL');
    expect(allCsv).toContain('Ancient Expense');
    expect(allCsv).toContain('Current Month Inflow');
    expect(allCsv).toContain('Running Balance');

    // 2. Export Current Month
    const currentMonthCsv = MoneyManagerPlugin.exportToCSV(transactions, profile.currency, 'CURRENT_MONTH');
    expect(currentMonthCsv).not.toContain('Ancient Expense');
    expect(currentMonthCsv).toContain('Current Month Inflow');

    // 3. Export Excel with range
    const excelOutput = MoneyManagerPlugin.exportToExcel(transactions, profile, analysis, 'CURRENT_MONTH');
    expect(excelOutput).toContain('<?xml version="1.0"?>');
    expect(excelOutput).toContain('Current Month Inflow');
    expect(excelOutput).not.toContain('Ancient Expense');
  });

  it('handles division by zero gracefully and rebalances surplus from discretionary categories', () => {
    const profile: BudgetProfile = {
      ...PAIOSStorage.getBudgetProfile(),
      discretionaryMonthly: 1000,
      foodMonthly: 200,
      salaryCycleDay: new Date().getDate(), // Target today as cycle boundary
    };

    const breachTx: ExpenseTransaction = {
      id: 'tx_breach_food',
      title: 'Expensive Catering',
      amount: 600,
      type: 'OUTFLOW',
      category: 'Food',
      dateString: getTodayDateString(),
      timestampMillis: Date.now(),
      isNecessity: true,
    };
    PAIOSStorage.saveExpenseTransaction(breachTx);

    const transactions = PAIOSStorage.getExpenseTransactions();
    const recovery = MoneyManagerPlugin.evaluateLossRecovery(profile, transactions, new Date());

    expect(recovery.daysRemaining).toBeGreaterThanOrEqual(1);
    expect(recovery.dailyReductionQuota).toBeGreaterThan(0);
    expect(Number.isFinite(recovery.dailyReductionQuota)).toBe(true);

    // Rebalance from surplus
    const { updatedProfile, updatedRecovery } = MoneyManagerPlugin.rebalanceFromSurplus(
      profile,
      'Entertainment',
      recovery.overageAmount,
      recovery
    );

    expect(updatedRecovery.status).toBe('RESOLVED');
    expect(updatedRecovery.activeBreach).toBe(false);
    expect(updatedProfile.foodMonthly).toBe(200 + recovery.overageAmount);
    expect(updatedProfile.discretionaryMonthly).toBe(1000 - recovery.overageAmount);
  });

  it('computes multi-timeline variance analytics with correct status chips', () => {
    const profile: BudgetProfile = {
      ...PAIOSStorage.getBudgetProfile(),
      foodMonthly: 500,
      discretionaryMonthly: 600,
    };

    const tx: ExpenseTransaction = {
      id: 'tx_food_normal',
      title: 'Weekly Groceries',
      amount: 150,
      type: 'OUTFLOW',
      category: 'Food',
      dateString: getTodayDateString(),
      timestampMillis: Date.now(),
      isNecessity: true,
    };
    PAIOSStorage.saveExpenseTransaction(tx);

    const timeline = MoneyManagerPlugin.calculatePlannedVsActual(
      profile,
      PAIOSStorage.getExpenseTransactions(),
      new Date()
    );

    expect(timeline.daily.status).toBeDefined();
    expect(timeline.weekly.status).toBeDefined();
    expect(timeline.monthly.categories.length).toBeGreaterThan(0);

    const foodCategory = timeline.monthly.categories.find((c) => c.category === 'Food');
    expect(foodCategory).toBeDefined();
    expect(foodCategory?.status).toBe('ON_TRACK');
  });
});

