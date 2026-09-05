/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoneyManagerPlugin } from '../../src/core/plugins/MoneyManagerPlugin';
import { PAIOSStorage } from '../../src/storage';
import { paiosDb } from '../../src/core/db';
import { SavingsPot, PotAllocationRecord } from '../../src/types';

describe('Unit Test: Target Savings Pots & Liquid Water Visualization Engine', () => {
  beforeEach(async () => {
    localStorage.clear();
    await paiosDb.savingsPots.clear();
    await paiosDb.potAllocations.clear();
  });

  describe('1. Fill Percentage & Progress Calculations', () => {
    it('computes exact fill percentage and remaining amount for partial fill', () => {
      const target = 10000;
      const deposit = 150;
      const progress = MoneyManagerPlugin.calculatePotProgress(deposit, target);

      // (150 / 10000) * 100 = 1.5 -> Math.round(1.5) = 2%
      expect(progress.fillPercentage).toBe(2);
      expect(progress.remainingAmount).toBe(9850);
      expect(progress.isCompleted).toBe(false);
    });

    it('reaches 100% and triggers isCompleted when deposit equals target', () => {
      const progress = MoneyManagerPlugin.calculatePotProgress(50000, 50000);

      expect(progress.fillPercentage).toBe(100);
      expect(progress.remainingAmount).toBe(0);
      expect(progress.isCompleted).toBe(true);
    });

    it('caps fill percentage at 100% and remaining at 0 when current amount exceeds target', () => {
      const progress = MoneyManagerPlugin.calculatePotProgress(12500, 10000);

      expect(progress.fillPercentage).toBe(100);
      expect(progress.remainingAmount).toBe(0);
      expect(progress.isCompleted).toBe(true);
    });

    it('safely handles zero or negative target amounts without division by zero', () => {
      const progress = MoneyManagerPlugin.calculatePotProgress(500, 0);

      expect(progress.fillPercentage).toBe(0);
      expect(progress.remainingAmount).toBe(0);
      expect(progress.isCompleted).toBe(false);
    });
  });

  describe('2. Multi-Pot Leftover Sweep Distribution Logic', () => {
    const mockPots: SavingsPot[] = [
      {
        id: 'pot_pc',
        title: 'Building PC',
        targetAmount: 60000,
        currentAmount: 10000,
        categoryColor: 'cyan',
        iconName: 'Cpu',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pot_exam',
        title: 'ISTQB Exam',
        targetAmount: 12000,
        currentAmount: 3000,
        categoryColor: 'violet',
        iconName: 'Award',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pot_bike',
        title: 'Bike Fund',
        targetAmount: 30000,
        currentAmount: 15000,
        categoryColor: 'emerald',
        iconName: 'Bike',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('divides surplus evenly across 3 pots (e.g., ₹150 -> ₹50 each)', () => {
      const distribution = MoneyManagerPlugin.distributeLeftoverSweep(150, mockPots, 'EVEN');

      expect(distribution).toHaveLength(3);
      expect(distribution[0].amount).toBe(50);
      expect(distribution[1].amount).toBe(50);
      expect(distribution[2].amount).toBe(50);

      const totalAllocated = distribution.reduce((sum, d) => sum + d.amount, 0);
      expect(totalAllocated).toBe(150);
    });

    it('handles uneven remainder fractions cleanly without dropping cents/paise (₹100 across 3 pots)', () => {
      const distribution = MoneyManagerPlugin.distributeLeftoverSweep(100, mockPots, 'EVEN');

      expect(distribution).toHaveLength(3);
      // 100 / 3 = 33.33 each with 0.01 remainder to first pot
      expect(distribution[0].amount).toBe(33.34);
      expect(distribution[1].amount).toBe(33.33);
      expect(distribution[2].amount).toBe(33.33);

      const total = Math.round(distribution.reduce((sum, d) => sum + d.amount, 0) * 100) / 100;
      expect(total).toBe(100);
    });

    it('allocates 100% of surplus to top priority pot under PRIORITY strategy', () => {
      // Pot progress:
      // PC: 10,000 / 60,000 = 16.6% (Lowest progress)
      // Exam: 3,000 / 12,000 = 25%
      // Bike: 15,000 / 30,000 = 50%
      const distribution = MoneyManagerPlugin.distributeLeftoverSweep(500, mockPots, 'PRIORITY');

      expect(distribution).toHaveLength(1);
      expect(distribution[0].potId).toBe('pot_pc');
      expect(distribution[0].amount).toBe(500);
    });

    it('skips already completed pots when distributing surplus', () => {
      const potsWithCompleted: SavingsPot[] = [
        { ...mockPots[0], isCompleted: true, currentAmount: 60000 },
        { ...mockPots[1], isCompleted: false },
        { ...mockPots[2], isCompleted: false },
      ];

      const distribution = MoneyManagerPlugin.distributeLeftoverSweep(100, potsWithCompleted, 'EVEN');
      expect(distribution).toHaveLength(2);
      expect(distribution.some((d) => d.potId === 'pot_pc')).toBe(false);
      expect(distribution[0].amount).toBe(50);
      expect(distribution[1].amount).toBe(50);
    });

    it('returns empty array when surplus is 0 or negative', () => {
      expect(MoneyManagerPlugin.distributeLeftoverSweep(0, mockPots)).toEqual([]);
      expect(MoneyManagerPlugin.distributeLeftoverSweep(-50, mockPots)).toEqual([]);
    });
  });

  describe('3. PAIOSStorage Savings Pot CRUD & Allocations', () => {
    it('creates, retrieves, and updates savings pots', () => {
      const newPot: SavingsPot = {
        id: 'pot_test_1',
        title: 'Mechanical Keyboard Fund',
        targetAmount: 8000,
        currentAmount: 2000,
        categoryColor: 'sky',
        iconName: 'Laptop',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(newPot);

      const pots = PAIOSStorage.getSavingsPots();
      const found = pots.find((p) => p.id === 'pot_test_1');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Mechanical Keyboard Fund');
      expect(found?.targetAmount).toBe(8000);
    });

    it('allocates deposit into pot, creates PotAllocationRecord, and updates completion status', () => {
      const testPot: SavingsPot = {
        id: 'pot_test_alloc',
        title: 'Camera Lens',
        targetAmount: 10000,
        currentAmount: 9000,
        categoryColor: 'amber',
        iconName: 'Target',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      PAIOSStorage.saveSavingsPot(testPot);

      // Allocate 1500 -> Current reaches 10,500 >= 10,000 -> isCompleted becomes true
      const { updatedPot, allocation } = PAIOSStorage.allocateToPot(
        'pot_test_alloc',
        1500,
        'DAILY_LEFTOVER_SWEEP',
        'Surplus allocation'
      );

      expect(updatedPot.currentAmount).toBe(10500);
      expect(updatedPot.isCompleted).toBe(true);
      expect(allocation.source).toBe('DAILY_LEFTOVER_SWEEP');
      expect(allocation.amount).toBe(1500);

      // Check allocation record in storage
      const records = PAIOSStorage.getPotAllocations();
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].potId).toBe('pot_test_alloc');
    });

    it('withdraws funds from pot and returns money to liquid balance without negative values', () => {
      const testPot: SavingsPot = {
        id: 'pot_test_withdraw',
        title: 'Emergency Stash',
        targetAmount: 5000,
        currentAmount: 3000,
        categoryColor: 'emerald',
        iconName: 'Shield',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      PAIOSStorage.saveSavingsPot(testPot);

      const { updatedPot } = PAIOSStorage.withdrawFromPot('pot_test_withdraw', 1000, 'Need cash');

      expect(updatedPot.currentAmount).toBe(2000);
      const inStorage = PAIOSStorage.getSavingsPots().find((p) => p.id === 'pot_test_withdraw');
      expect(inStorage?.currentAmount).toBe(2000);
    });

    it('deletes savings pot properly from storage', () => {
      const testPot: SavingsPot = {
        id: 'pot_to_delete',
        title: 'Temporary Jar',
        targetAmount: 1000,
        currentAmount: 0,
        categoryColor: 'rose',
        iconName: 'Gift',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      PAIOSStorage.saveSavingsPot(testPot);
      expect(PAIOSStorage.getSavingsPots().some((p) => p.id === 'pot_to_delete')).toBe(true);

      PAIOSStorage.deleteSavingsPot('pot_to_delete');
      expect(PAIOSStorage.getSavingsPots().some((p) => p.id === 'pot_to_delete')).toBe(false);
    });

    it('dispatches paios_storage_change on allocation to ensure multi-platform reactivity', () => {
      const listener = vi.fn();
      window.addEventListener('paios_storage_change', listener);

      const pot: SavingsPot = {
        id: 'pot_reactivity_test',
        title: 'Sync Fund',
        targetAmount: 5000,
        currentAmount: 1000,
        categoryColor: 'cyan',
        iconName: 'Coins',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      PAIOSStorage.saveSavingsPot(pot);

      PAIOSStorage.allocateToPot('pot_reactivity_test', 200, 'MANUAL_DEPOSIT');

      expect(listener).toHaveBeenCalled();
      window.removeEventListener('paios_storage_change', listener);
    });
  });

  describe('4. Dexie.js Table Storage & Hydration', () => {
    it('persists and retrieves savingsPots directly in Dexie.js tables', async () => {
      const pot: SavingsPot = {
        id: 'pot_dexie_direct',
        title: 'Dexie Pot',
        targetAmount: 20000,
        currentAmount: 8000,
        categoryColor: 'violet',
        iconName: 'Award',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await paiosDb.savingsPots.put(pot);
      const retrieved = await paiosDb.savingsPots.get('pot_dexie_direct');

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Dexie Pot');
      expect(retrieved?.currentAmount).toBe(8000);
    });

    it('persists and retrieves potAllocations in Dexie.js tables', async () => {
      const alloc: PotAllocationRecord = {
        id: 'alloc_dexie_test',
        potId: 'pot_dexie_direct',
        amount: 250,
        date: '2026-09-05',
        timestamp: new Date().toISOString(),
        source: 'WINDFALL',
        notes: 'Bonus',
      };

      await paiosDb.potAllocations.put(alloc);
      const retrieved = await paiosDb.potAllocations.get('alloc_dexie_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.amount).toBe(250);
      expect(retrieved?.source).toBe('WINDFALL');
    });

    it('hydrates PAIOSStorage memoryCache from Dexie savingsPots and potAllocations', async () => {
      const samplePot: SavingsPot = {
        id: 'pot_hydration_test',
        title: 'Hydration Target',
        targetAmount: 15000,
        currentAmount: 5000,
        categoryColor: 'emerald',
        iconName: 'Bike',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await paiosDb.savingsPots.put(samplePot);

      const hydrated = await PAIOSStorage.hydrateFromDexie();
      expect(hydrated).toBe(true);

      const pots = PAIOSStorage.getSavingsPots();
      const found = pots.find((p) => p.id === 'pot_hydration_test');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Hydration Target');
    });
  });
});
