import { describe, it, expect } from 'vitest';
import {
  MoneyManagerPlugin,
  DEFAULT_BUDGET_PROFILE,
} from '../../src/core/plugins/MoneyManagerPlugin';
import { BudgetProfile, ExpenseTransaction } from '../../src/types';

describe('Unit Test: MoneyManagerPlugin Financial Engine & Budget Analyzer', () => {
  const sampleProfile: BudgetProfile = {
    id: 'test_profile',
    monthlySalary: 6000,
    currency: '$',
    salaryCycleDay: 1,
    foodMonthly: 800,
    travelMonthly: 400,
    healthMonthly: 300,
    housingMonthly: 1500,
    loanClearanceMonthly: 500, // Total Fixed: 3500
    learningMonthly: 200,
    investingMonthly: 800,
    savingsMonthly: 500, // Total Growth: 1500
    discretionaryMonthly: 1000,
    expectedAnnualReturnRate: 12,
    updatedAtMillis: Date.now(),
  };

  it('calculates cycle dates and days remaining accurately for 1st of the month', () => {
    const targetDate = new Date(2026, 7, 15); // Aug 15, 2026
    const cycle = MoneyManagerPlugin.calculateCycleDates(1, targetDate);

    expect(cycle.cycleStartDate).toBe('2026-08-01');
    expect(cycle.cycleEndDate).toBe('2026-08-31');
    expect(cycle.totalDaysInCycle).toBe(31);
    expect(cycle.daysRemaining).toBe(17);
    expect(cycle.currentDayInCycle).toBe(15);
  });

  it('evaluates complete budget analysis, safe-to-spend limits, and 50/30/20 ratios', () => {
    const analysis = MoneyManagerPlugin.analyzeBudget(sampleProfile, [], new Date(2026, 7, 1));

    expect(analysis.totalFixedObligations).toBe(3500);
    expect(analysis.totalPlannedInvestments).toBe(1500);
    expect(analysis.totalFreeMoney).toBe(1000); // 6000 - 5000 = 1000

    // 1000 / 31 = ~32.26
    expect(analysis.safeToSpendDaily).toBeCloseTo(32.26, 1);
    expect(analysis.safeToSpendWeekly).toBeCloseTo(32.26 * 7, 0);
    expect(analysis.idealDailySavings).toBeCloseTo(1500 / 31, 1);

    expect(analysis.needsRatio).toBe(Math.round((3500 / 6000) * 100)); // 58%
    expect(analysis.savingsRatio).toBe(Math.round((1500 / 6000) * 100)); // 25%
    expect(analysis.budgetHealthScore).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it('computes daily leftover surplus when actual spending is logged', () => {
    const todayStr = '2026-08-15';
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx1',
        title: 'Morning Coffee',
        amount: 5.5,
        category: 'Food',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: false,
      },
      {
        id: 'tx2',
        title: 'Subway ticket',
        amount: 4.5,
        category: 'Travel',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: true,
      },
    ];

    const surplus = MoneyManagerPlugin.calculateDailySurplus(sampleProfile, transactions, todayStr);

    expect(surplus.actualSpend).toBe(10);
    expect(surplus.isOverBudget).toBe(false);
    expect(surplus.surplusAmount).toBeCloseTo(surplus.dailyBudget - 10, 1);
  });

  it('flags over-budget condition when daily expenses exceed safe limit', () => {
    const todayStr = '2026-08-15';
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx1',
        title: 'Luxury Dinner',
        amount: 150.0,
        category: 'Entertainment',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: false,
      },
    ];

    const surplus = MoneyManagerPlugin.calculateDailySurplus(sampleProfile, transactions, todayStr);

    expect(surplus.actualSpend).toBe(150);
    expect(surplus.isOverBudget).toBe(true);
    expect(surplus.surplusAmount).toBe(0);
  });

  it('generates multi-horizon projected compound growth points', () => {
    const growth = MoneyManagerPlugin.calculateProjectedGrowth(sampleProfile, 10, 36, 10);

    expect(growth.length).toBeGreaterThan(0);

    const finalPoint = growth[growth.length - 1];
    expect(finalPoint.month).toBe(36);
    expect(finalPoint.regularSavings).toBe(1300 * 36); // (800 + 500) * 36 = 46,800
    expect(finalPoint.boostedWithSurplus).toBe((1300 + 300) * 36); // (1300 + 300) * 36 = 57,600
    expect(finalPoint.compoundPortfolio).toBeGreaterThan(finalPoint.boostedWithSurplus);
  });

  it('calculates moving spending averages across transactions window', () => {
    const now = Date.now();
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx1',
        title: 'Groceries',
        amount: 120,
        category: 'Food',
        dateString: '2026-08-10',
        timestampMillis: now - 1000 * 60 * 60 * 24 * 2, // 2 days ago
        isNecessity: true,
      },
      {
        id: 'tx2',
        title: 'Gas',
        amount: 60,
        category: 'Travel',
        dateString: '2026-08-11',
        timestampMillis: now - 1000 * 60 * 60 * 24 * 1, // 1 day ago
        isNecessity: true,
      },
    ];

    const averages = MoneyManagerPlugin.calculateSpendingAverages(transactions, 30);
    expect(averages.totalSpent).toBe(180);
    expect(averages.averageDailySpend).toBe(6); // 180 / 30 = 6
    expect(averages.categoryBreakdown['Food']).toBe(120);
    expect(averages.categoryBreakdown['Travel']).toBe(60);
  });
});
