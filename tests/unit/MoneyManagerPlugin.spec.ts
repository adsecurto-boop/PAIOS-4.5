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
    currentBalance: 4000,
    currentSaved: 10000,
    currentInvested: 25000,
    currentDebt: 15000,
    debtInterestRate: 10,
    savingsInterestRate: 4,
    foodMonthly: 800,
    travelMonthly: 400,
    healthMonthly: 300,
    housingMonthly: 1500,
    loanClearanceMonthly: 500,
    familyContributionMonthly: 400, // Total Fixed: 3900
    learningMonthly: 200,
    investingMonthly: 800,
    savingsMonthly: 500, // Total Growth: 1500
    discretionaryMonthly: 600,
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

  it('evaluates complete budget analysis including family contribution, net worth, and 50/30/20 ratios', () => {
    const analysis = MoneyManagerPlugin.analyzeBudget(sampleProfile, [], new Date(2026, 7, 1));

    expect(analysis.totalFixedObligations).toBe(3900); // 800+400+300+1500+500+400
    expect(analysis.totalPlannedInvestments).toBe(1500);
    expect(analysis.totalFreeMoney).toBe(600); // 6000 - (3900 + 1500) = 600

    expect(analysis.totalAssets).toBe(39000); // 4000 + 10000 + 25000
    expect(analysis.totalDebt).toBe(15000);
    expect(analysis.netWorth).toBe(24000); // 39000 - 15000

    // 600 / 31 = ~19.35
    expect(analysis.safeToSpendDaily).toBeCloseTo(19.35, 1);
    expect(analysis.safeToSpendWeekly).toBeCloseTo(19.35 * 7, 0);

    expect(analysis.needsRatio).toBe(Math.round((3900 / 6000) * 100)); // 65%
    expect(analysis.savingsRatio).toBe(Math.round((1500 / 6000) * 100)); // 25%
    expect(analysis.budgetHealthScore).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it('computes exact debt-free timeline and amortization with interest rate', () => {
    const debtCalc = MoneyManagerPlugin.calculateDebtFreeTimeline(sampleProfile);

    expect(debtCalc.isPayoffPossible).toBe(true);
    expect(debtCalc.debtFreeMonths).toBeGreaterThan(0);
    expect(debtCalc.debtFreeMonths).toBeLessThan(40);
    expect(debtCalc.totalInterestPaid).toBeGreaterThan(0);
    expect(debtCalc.points.length).toBeGreaterThan(0);
    expect(debtCalc.points[0].remainingPrincipal).toBe(15000);
    expect(debtCalc.points[debtCalc.points.length - 1].remainingPrincipal).toBe(0);
  });

  it('computes invested timeline with starting portfolio and compound CAGR', () => {
    const investedTimeline = MoneyManagerPlugin.calculateInvestedTimeline(sampleProfile, 60, 12);

    expect(investedTimeline.length).toBeGreaterThan(0);
    expect(investedTimeline[0].startingBalance).toBe(25000);
    const finalPoint = investedTimeline[investedTimeline.length - 1];
    expect(finalPoint.totalInvestedValue).toBeGreaterThan(finalPoint.contributions);
    expect(finalPoint.interestEarned).toBeGreaterThan(0);
  });

  it('computes savings growth timeline and emergency fund target milestones', () => {
    const savingsTimeline = MoneyManagerPlugin.calculateSavingsTimeline(sampleProfile, 10, 36, 4);

    expect(savingsTimeline.length).toBeGreaterThan(0);
    expect(savingsTimeline[0].emergencyTarget3Mo).toBe(3900 * 3); // 11700
    expect(savingsTimeline[0].emergencyTarget6Mo).toBe(3900 * 6); // 23400
    const finalPoint = savingsTimeline[savingsTimeline.length - 1];
    expect(finalPoint.projectedSavingsTotal).toBeGreaterThan(10000);
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
    expect(finalPoint.regularSavings).toBe(25000 + 1300 * 36);
    expect(finalPoint.boostedWithSurplus).toBe(25000 + (1300 + 300) * 36);
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

  it('computes dual Inflow, Outflow, and Daily Net Savings accurately (Requirement 1)', () => {
    const todayStr = '2026-08-15';
    const transactions: ExpenseTransaction[] = [
      {
        id: 'in1',
        title: 'Freelance API Audit',
        amount: 250,
        type: 'INFLOW',
        category: 'Freelance',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: false,
      },
      {
        id: 'in2',
        title: 'Stock Dividend',
        amount: 45,
        type: 'INFLOW',
        category: 'Dividends',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: false,
      },
      {
        id: 'out1',
        title: 'Grocery Supplies',
        amount: 65,
        type: 'OUTFLOW',
        category: 'Food',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: true,
      },
      {
        id: 'out2',
        title: 'Ride share',
        amount: 20,
        type: 'OUTFLOW',
        category: 'Travel',
        dateString: todayStr,
        timestampMillis: Date.now(),
        isNecessity: true,
      },
    ];

    const net = MoneyManagerPlugin.calculateDailyNetSavings(transactions, todayStr);
    expect(net.totalInflow).toBe(295); // 250 + 45
    expect(net.totalOutflow).toBe(85); // 65 + 20
    expect(net.netSaved).toBe(210); // 295 - 85

    const surplus = MoneyManagerPlugin.calculateDailySurplus(sampleProfile, transactions, todayStr);
    expect(surplus.totalInflow).toBe(295);
    expect(surplus.actualSpend).toBe(85);
    expect(surplus.netSaved).toBe(210);
    expect(surplus.surplusAmount).toBeGreaterThanOrEqual(210);
  });

  it('exports RFC 4180 compliant CSV ledger with dual types and running balances (Requirement 2)', () => {
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx1',
        title: 'Salary Credit',
        amount: 5000,
        type: 'INFLOW',
        category: 'Salary',
        dateString: '2026-08-01',
        timeString: '09:00',
        timestampMillis: 1785500000000,
        isNecessity: false,
        notes: 'Monthly direct deposit',
      },
      {
        id: 'tx2',
        title: 'Rent payment',
        amount: 1400,
        type: 'OUTFLOW',
        category: 'Housing',
        dateString: '2026-08-02',
        timeString: '10:30',
        timestampMillis: 1785590000000,
        isNecessity: true,
        notes: 'Apartment rent',
      },
    ];

    const csv = MoneyManagerPlugin.exportToCSV(transactions, '$');
    expect(csv).toContain('Date,Time,Type,Title,Category,Amount ($),Net Running Balance ($),Notes');
    expect(csv).toContain('"2026-08-01","09:00","INFLOW","Salary Credit","Salary",5000.00,5000.00,"Monthly direct deposit"');
    expect(csv).toContain('"2026-08-02","10:30","OUTFLOW","Rent payment","Housing",-1400.00,3600.00,"Apartment rent"');
  });

  it('exports valid Excel XML Spreadsheet workbook with overview and ledger worksheets (Requirement 2)', () => {
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx1',
        title: 'Consulting Gig',
        amount: 800,
        type: 'INFLOW',
        category: 'Freelance',
        dateString: '2026-08-05',
        timestampMillis: 1785800000000,
        isNecessity: false,
      },
    ];

    const analysis = MoneyManagerPlugin.analyzeBudget(sampleProfile, transactions, new Date());
    const excelXml = MoneyManagerPlugin.exportToExcel(transactions, sampleProfile, analysis);

    expect(excelXml).toContain('<?xml version="1.0"?>');
    expect(excelXml).toContain('ss:Name="Overview &amp; Wealth Analytics"');
    expect(excelXml).toContain('ss:Name="Transaction Ledger"');
    expect(excelXml).toContain('Consulting Gig');
    expect(excelXml).toContain('Freelance');
  });

  it('computes Planned vs Actual multi-timeline variances across Daily, Weekly, and Monthly (Requirement 3)', () => {
    const targetDate = new Date(2026, 7, 15);
    const targetDateStr = '2026-08-15';

    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx_food',
        title: 'Weekly Groceries',
        amount: 400,
        type: 'OUTFLOW',
        category: 'Food',
        dateString: '2026-08-10',
        timestampMillis: new Date('2026-08-10T12:00:00Z').getTime(),
        isNecessity: true,
      },
      {
        id: 'tx_today',
        title: 'Lunch',
        amount: 15,
        type: 'OUTFLOW',
        category: 'Food',
        dateString: targetDateStr,
        timestampMillis: targetDate.getTime(),
        isNecessity: true,
      },
    ];

    const timeline = MoneyManagerPlugin.calculatePlannedVsActual(sampleProfile, transactions, targetDate);

    // Daily
    expect(timeline.daily.actualSpent).toBe(15);
    expect(timeline.daily.safeCap).toBeGreaterThan(0);
    expect(timeline.daily.status).toBe('ON_TRACK');

    // Weekly
    expect(timeline.weekly.actualSpent).toBe(415);
    expect(timeline.weekly.rollingCap).toBeGreaterThan(0);

    // Monthly Category Breakdown
    const foodCat = timeline.monthly.categories.find((c) => c.category === 'Food');
    expect(foodCat).toBeDefined();
    expect(foodCat?.planned).toBe(800);
    expect(foodCat?.actual).toBe(415);
    expect(foodCat?.variance).toBe(385);
    expect(foodCat?.status).toBe('ON_TRACK');
  });

  it('evaluates loss-to-expense recovery arbiter and calculates daily reduction quota (Requirement 4)', () => {
    const targetDate = new Date(2026, 7, 15);
    const targetDateStr = '2026-08-15';

    // Log an expense that breaches food category (planned 800, actual 1000 => 200 overage)
    const transactions: ExpenseTransaction[] = [
      {
        id: 'tx_overage',
        title: 'Fine Dining Extravaganza',
        amount: 1000,
        type: 'OUTFLOW',
        category: 'Food',
        dateString: targetDateStr,
        timestampMillis: targetDate.getTime(),
        isNecessity: false,
      },
    ];

    const recovery = MoneyManagerPlugin.evaluateLossRecovery(sampleProfile, transactions, targetDate);

    expect(recovery.activeBreach).toBe(true);
    expect(recovery.overageAmount).toBeGreaterThanOrEqual(200);
    expect(recovery.dailyReductionQuota).toBeGreaterThan(0);
    expect(recovery.tradeOffSuggestion.length).toBeGreaterThan(0);

    // Test applying the recovery adjustment
    const { updatedProfile, updatedRecovery } = MoneyManagerPlugin.applyRecoveryAdjustment(
      sampleProfile,
      recovery
    );
    expect(updatedProfile.appliedRecoveryAdjustment).toBe(recovery.dailyReductionQuota);
    expect(updatedRecovery.status).toBe('ADJUSTED');

    // Verify effective safe budget reflects reduction
    const reanalysis = MoneyManagerPlugin.analyzeBudget(updatedProfile, transactions, targetDate);
    expect(reanalysis.effectiveDailyBudget).toBeCloseTo(
      Math.max(0, reanalysis.safeToSpendDaily - recovery.dailyReductionQuota),
      2
    );
  });

  it('shifts surplus from one category to another to absorb overages (Requirement 4)', () => {
    const updated = MoneyManagerPlugin.shiftCategorySurplus(
      sampleProfile,
      'Entertainment',
      'Food',
      100
    );

    expect(updated.discretionaryMonthly).toBe(500); // 600 - 100
    expect(updated.foodMonthly).toBe(900); // 800 + 100
  });
});
