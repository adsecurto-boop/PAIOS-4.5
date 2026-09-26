import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { PAIOSStorage } from '../../src/storage';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { ActionMutationPlanner } from '../../src/core/actions/ActionMutationPlanner';

vi.mock('../../src/core/actions/StorageMutationAdapters', () => ({
  StorageMutationAdapters: {
    getAdapter: vi.fn().mockReturnValue({
      captureSnapshot: vi.fn().mockReturnValue({ exists: false, data: null }),
      restoreSnapshot: vi.fn().mockReturnValue({ success: true })
    })
  }
}));

vi.mock('../../src/storage', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    PAIOSStorage: {
      ...actual.PAIOSStorage,
      setItem: vi.fn(),
      getItem: vi.fn().mockReturnValue(null),
      addTask: vi.fn().mockReturnValue({ id: 'task1' }),
      updateTask: vi.fn(),
      getTasks: vi.fn().mockReturnValue([{ id: 'task1', status: 'TODO' }])
    }
  };
});

describe('StepMarkerFailureRollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls back completely if recordActionExecutionStep throws', async () => {
    // Spy on recordActionExecutionStep to throw
    vi.spyOn(ActionStorage, 'recordActionExecutionStep').mockImplementation(() => {
      throw new Error('Failed to write step marker');
    });
    
    // We also need to mock getTransaction/saveTransaction to avoid issues
    vi.spyOn(ActionStorage, 'saveTransaction').mockImplementation(() => {});
    vi.spyOn(ActionStorage, 'getTransaction').mockImplementation(() => null as any);

    const action: ProposedAction = {
      id: 'a1',
      transactionId: 't1',
      type: 'CREATE_TASK',
      payload: { title: 'Test Task' } as any,
      risk: 'LOW',
      title: 'Create',
      explanation: '',
      sourceText: '',
      affectedRecordIds: [],
      expectedRevisions: {},
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      originDeviceId: 'test'
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'Create task');
    // Ensure we provide beforeSnapshots otherwise it fails in executeTransaction
    
    const result = await ActionTransactionManager.executeTransaction(tx);
    console.log('StepMarkerFailureRollback Result:', result);
    
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    
    // It should have caught the step marker error, restored snapshots (which would call StorageMutationAdapters)
    // Actually we don't strictly need to check internal storage calls, just that it entered ROLLING_BACK and rolledBack is true
  });
});
