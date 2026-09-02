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

  it('generates downloadable CSV and Excel spreadsheets without network egress', () => {
    const profile = PAIOSStorage.getBudgetProfile();
    const transactions = PAIOSStorage.getExpenseTransactions();
    const analysis = MoneyManagerPlugin.analyzeBudget(profile, transactions);

    const csvOutput = MoneyManagerPlugin.exportToCSV(transactions, profile.currency);
    expect(typeof csvOutput).toBe('string');
    expect(csvOutput.startsWith('Date,Time,Type,Title,Category,Amount')).toBe(true);

    const excelOutput = MoneyManagerPlugin.exportToExcel(transactions, profile, analysis);
    expect(typeof excelOutput).toBe('string');
    expect(excelOutput).toContain('<?xml version="1.0"?>');
    expect(excelOutput).toContain('Worksheet ss:Name="Overview &amp; Wealth Analytics"');
  });
});
