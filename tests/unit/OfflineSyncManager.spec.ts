/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OfflineSyncManager } from '../../src/core/sync/OfflineSyncManager';
import { PAIOSStorage } from '../../src/storage';
import { AuthSyncService } from '../../src/services/AuthSyncService';

describe('Unit Test: OfflineSyncManager FIFO Buffer & Reconnection', () => {
  beforeEach(() => {
    OfflineSyncManager.clearQueue();
    PAIOSStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues mutations into chronological FIFO queue when offline', () => {
    vi.stubGlobal('navigator', { onLine: false });

    const mut1 = OfflineSyncManager.enqueueMutation('key_1', { task: 1 });
    const mut2 = OfflineSyncManager.enqueueMutation('key_2', { task: 2 });

    expect(mut1.id).toContain('mut_');
    const queue = OfflineSyncManager.getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].key).toBe('key_1');
    expect(queue[1].key).toBe('key_2');
  });

  it('filters duplicate queue entries for same storage key', () => {
    vi.stubGlobal('navigator', { onLine: false });

    OfflineSyncManager.enqueueMutation('paios_tasks', [{ id: 1 }]);
    OfflineSyncManager.enqueueMutation('paios_tasks', [{ id: 1 }, { id: 2 }]);

    const queue = OfflineSyncManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toHaveLength(2);
  });

  it('flushes queue on reconnection when user is authenticated', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue('mock_jwt_token');
    const pushSpy = vi.spyOn(AuthSyncService, 'pushData').mockResolvedValue({
      success: true,
      key: 'key_1',
      syncedAt: Date.now(),
    });

    OfflineSyncManager.enqueueMutation('key_1', { data: 'test' });
    expect(OfflineSyncManager.getQueue()).toHaveLength(1);

    vi.stubGlobal('navigator', { onLine: true });
    const result = await OfflineSyncManager.flushQueue();

    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(OfflineSyncManager.getQueue()).toHaveLength(0);
    expect(pushSpy).toHaveBeenCalled();
  });

  it('skips flush when unauthenticated or guest session active', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue(null);

    OfflineSyncManager.enqueueMutation('guest_key', { a: 1 });
    const result = await OfflineSyncManager.flushQueue();

    expect(result.processed).toBe(0);
  });

  it('supports DELETE action mutations in queue', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue('mock_jwt_token');
    const deleteSpy = vi.spyOn(AuthSyncService, 'deleteData').mockResolvedValue({ success: true });

    OfflineSyncManager.enqueueMutation('del_key', null, 'DELETE');
    vi.stubGlobal('navigator', { onLine: true });

    const result = await OfflineSyncManager.flushQueue();
    expect(result.processed).toBe(1);
    expect(deleteSpy).toHaveBeenCalledWith('del_key');
  });

  it('increments retryCount on push failure and retains mutation in queue', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue('mock_jwt_token');
    vi.spyOn(AuthSyncService, 'pushData').mockRejectedValue(new Error('Push Failed'));

    OfflineSyncManager.enqueueMutation('retry_key', { data: 'retry' });
    const result = await OfflineSyncManager.flushQueue();

    expect(result.processed).toBe(0);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(1);

    const queue = OfflineSyncManager.getQueue();
    expect(queue[0].retryCount).toBe(1);
  });

  it('never discards a failed local mutation after repeated retries', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue('mock_jwt_token');
    vi.spyOn(AuthSyncService, 'pushData').mockRejectedValue(new Error('Push Failed'));

    OfflineSyncManager.enqueueMutation('persistent_key', { important: true });
    vi.stubGlobal('navigator', { onLine: true });
    for (let attempt = 0; attempt < 11; attempt++) {
      await OfflineSyncManager.flushQueue();
    }

    const queue = OfflineSyncManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(11);
  });

  it('publishes syncing and synced lifecycle events around a successful flush', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.spyOn(AuthSyncService, 'getToken').mockReturnValue('mock_jwt_token');
    vi.spyOn(AuthSyncService, 'pushData').mockResolvedValue({ success: true });
    const statuses: string[] = [];
    const listener = (event: Event) => statuses.push((event as CustomEvent).detail.status);
    window.addEventListener('paios_sync_status', listener);

    OfflineSyncManager.enqueueMutation('status_key', { value: 1 });
    await OfflineSyncManager.flushQueue();

    window.removeEventListener('paios_sync_status', listener);
    expect(statuses).toContain('syncing');
    expect(statuses.at(-1)).toBe('synced');
  });

  it('binds online event listener on init()', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    OfflineSyncManager.init();
    expect(addListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
  });

  it('clears queue on clearQueue()', () => {
    vi.stubGlobal('navigator', { onLine: false });

    OfflineSyncManager.enqueueMutation('key_temp', { a: 1 });
    expect(OfflineSyncManager.getQueue()).toHaveLength(1);

    OfflineSyncManager.clearQueue();
    expect(OfflineSyncManager.getQueue()).toHaveLength(0);
  });
});
