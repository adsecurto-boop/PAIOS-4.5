/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { paiosDb, migrateLocalStorageToDexie } from '../../src/core/db';
import { PAIOSStorage } from '../../src/storage';
import { Task, Medication } from '../../src/types';

describe('PaiosDexieDB (Dexie.js / IndexedDB)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await paiosDb.tasks.clear();
    await paiosDb.medications.clear();
    await paiosDb.doseEvents.clear();
    await paiosDb.transactions.clear();
    await paiosDb.savingsPots.clear();
    await paiosDb.potAllocations.clear();
  });

  it('initializes tables properly and permits typed CRUD operations', async () => {
    const task: Task = {
      id: 991,
      title: 'Automated Test Task',
      description: 'Dexie testing',
      priority: 'HIGH',
      status: 'TODO',
      isPriorityPin: true,
      category: 'Testing',
      createdAtMillis: Date.now(),
    };

    await paiosDb.tasks.put(task);
    const retrieved = await paiosDb.tasks.get(991);

    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Automated Test Task');
    expect(retrieved?.priority).toBe('HIGH');
  });

  it('migrates legacy localStorage items to Dexie tables', async () => {
    const sampleTasks: Task[] = [
      {
        id: 881,
        title: 'Legacy Task 1',
        description: '',
        priority: 'NORMAL',
        status: 'TODO',
        isPriorityPin: false,
        category: 'Work',
        createdAtMillis: 1000,
      },
    ];
    localStorage.setItem('paios_tasks_v1', JSON.stringify(sampleTasks));

    await migrateLocalStorageToDexie();

    const inDb = await paiosDb.tasks.get(881);
    expect(inDb).toBeDefined();
    expect(inDb?.title).toBe('Legacy Task 1');
  });

  it('supports reactive mutation subscribers', () => {
    let triggered = false;
    const unsub = paiosDb.subscribe(() => {
      triggered = true;
    });

    paiosDb.notifyMutation();
    expect(triggered).toBe(true);

    triggered = false;
    unsub();
    paiosDb.notifyMutation();
    expect(triggered).toBe(false);
  });

  it('hydrates PAIOSStorage memoryCache from Dexie tables via hydrateFromDexie()', async () => {
    const sampleMed: Medication = {
      id: 'med_dexie_test',
      genericName: 'Testolol',
      brandName: 'Testril',
      dosageStrength: 10,
      dosageUnit: 'mg',
      form: 'tablet',
      route: 'oral',
      status: 'active',
      instructions: 'Take 1 daily',
      scheduleTimes: ['08:00'],
      createdAtMillis: 123456,
    };

    await paiosDb.medications.put(sampleMed);

    const hydrated = await PAIOSStorage.hydrateFromDexie();
    expect(hydrated).toBe(true);

    const meds = PAIOSStorage.getMedications();
    const found = meds.find((m) => m.id === 'med_dexie_test');
    expect(found).toBeDefined();
    expect(found?.genericName).toBe('Testolol');
  });

  it('supports savingsPots and potAllocations typed stores in Dexie DB', async () => {
    await paiosDb.savingsPots.put({
      id: 'pot_dexie_test',
      title: 'PC Upgrade',
      targetAmount: 50000,
      currentAmount: 15000,
      categoryColor: 'cyan',
      iconName: 'Cpu',
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pot = await paiosDb.savingsPots.get('pot_dexie_test');
    expect(pot).toBeDefined();
    expect(pot?.title).toBe('PC Upgrade');
    expect(pot?.targetAmount).toBe(50000);

    await paiosDb.potAllocations.put({
      id: 'alloc_dexie_test_1',
      potId: 'pot_dexie_test',
      amount: 150,
      date: '2026-09-05',
      timestamp: new Date().toISOString(),
      source: 'DAILY_LEFTOVER_SWEEP',
    });

    const alloc = await paiosDb.potAllocations.get('alloc_dexie_test_1');
    expect(alloc).toBeDefined();
    expect(alloc?.amount).toBe(150);
  });
});

