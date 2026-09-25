import { describe, expect, it } from 'vitest';
import { mergeCloudSnapshots, SyncMetadata } from '../../src/utils/recordSync';

const metadata = (deviceId: string, keys: SyncMetadata['keys']): SyncMetadata => ({ deviceId, keys });

describe('record-level cloud merge', () => {
  it('keeps independent task edits made on different devices', () => {
    const key = 'paios_tasks_v1';
    const result = mergeCloudSnapshots(
      { [key]: [{ id: 1, title: 'Local task' }] },
      { [key]: [{ id: 2, title: 'Cloud task' }] },
      metadata('desktop', { [key]: { updatedAt: 20, deviceId: 'desktop', records: { '1': { updatedAt: 20, deviceId: 'desktop' } } } }),
      metadata('android', { [key]: { updatedAt: 21, deviceId: 'android', records: { '2': { updatedAt: 21, deviceId: 'android' } } } }),
      21,
    );

    expect(result.snapshot[key].map((task: any) => task.id).sort()).toEqual([1, 2]);
  });

  it('honors a newer deletion tombstone instead of resurrecting a record', () => {
    const key = 'paios_tasks_v1';
    const result = mergeCloudSnapshots(
      { [key]: [{ id: 1, title: 'Delete me' }] },
      { [key]: [] },
      metadata('desktop', { [key]: { updatedAt: 20, deviceId: 'desktop', records: { '1': { updatedAt: 20, deviceId: 'desktop' } } } }),
      metadata('android', { [key]: { updatedAt: 30, deviceId: 'android', records: { '1': { updatedAt: 30, deviceId: 'android', deleted: true } } } }),
      30,
    );

    expect(result.snapshot[key]).toEqual([]);
    expect(result.metadata.keys[key].records?.['1'].deleted).toBe(true);
  });

  it('uses deterministic device ordering when timestamps tie', () => {
    const key = 'paios_tasks_v1';
    const result = mergeCloudSnapshots(
      { [key]: [{ id: 1, title: 'Desktop' }] },
      { [key]: [{ id: 1, title: 'Web' }] },
      metadata('desktop', { [key]: { updatedAt: 20, deviceId: 'desktop', records: { '1': { updatedAt: 20, deviceId: 'desktop' } } } }),
      metadata('web', { [key]: { updatedAt: 20, deviceId: 'web', records: { '1': { updatedAt: 20, deviceId: 'web' } } } }),
      20,
    );

    expect(result.snapshot[key][0].title).toBe('Web');
  });
});
