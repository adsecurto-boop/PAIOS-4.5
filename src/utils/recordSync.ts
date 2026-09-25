export const SYNC_METADATA_KEY = 'paios_sync_metadata_v2';
const DEVICE_ID_KEY = 'paios_sync_device_id_v1';

export interface RecordRevision {
  updatedAt: number;
  deleted?: boolean;
  deviceId: string;
}

export interface KeyRevision extends RecordRevision {
  records?: Record<string, RecordRevision>;
}

export interface SyncMetadata {
  deviceId: string;
  keys: Record<string, KeyRevision>;
}

const mapCollectionKeys = new Set([
  'paios_checkin_v1',
  'paios_review_v1',
  'paios_weekly_reviews_v1',
  'paios_dose_events_v1',
]);

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

export const getSyncDeviceId = (): string => {
  if (typeof localStorage === 'undefined') return 'server';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

export const getSyncMetadata = (): SyncMetadata => {
  const deviceId = getSyncDeviceId();
  if (typeof localStorage === 'undefined') return { deviceId, keys: {} };
  const stored = safeParse<SyncMetadata>(localStorage.getItem(SYNC_METADATA_KEY), { deviceId, keys: {} });
  return { deviceId, keys: stored.keys || {} };
};

export const storeSyncMetadata = (metadata: SyncMetadata): void => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
};

const recordEntries = (key: string, value: unknown): Map<string, unknown> | null => {
  if (Array.isArray(value)) {
    const entries = value.filter((item) => item && typeof item === 'object' && 'id' in item)
      .map((item: any) => [String(item.id), item] as const);
    return entries.length === value.length ? new Map(entries) : null;
  }
  if (mapCollectionKeys.has(key) && value && typeof value === 'object') {
    return new Map(Object.entries(value as Record<string, unknown>));
  }
  return null;
};

export const recordLocalSyncMutation = (key: string, oldValue: unknown, value: unknown, now = Date.now()): void => {
  if (key === SYNC_METADATA_KEY || key.startsWith('paios_auth_') || key.startsWith('paios_offline_') || key.startsWith('paios_pending_')) return;
  const metadata = getSyncMetadata();
  const previous = metadata.keys[key];
  const revision: KeyRevision = { updatedAt: now, deviceId: metadata.deviceId, records: { ...(previous?.records || {}) } };
  const oldRecords = recordEntries(key, oldValue);
  const newRecords = recordEntries(key, value);
  if (newRecords) {
    const ids = new Set([...(oldRecords?.keys() || []), ...newRecords.keys()]);
    ids.forEach((id) => {
      const before = oldRecords?.get(id);
      const after = newRecords.get(id);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        revision.records![id] = { updatedAt: now, deviceId: metadata.deviceId, deleted: after === undefined };
      }
    });
  } else {
    delete revision.records;
  }
  metadata.keys[key] = revision;
  storeSyncMetadata(metadata);
};

const newer = (left?: RecordRevision, right?: RecordRevision): 'left' | 'right' => {
  if (!left) return 'right';
  if (!right) return 'left';
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? 'left' : 'right';
  return left.deviceId >= right.deviceId ? 'left' : 'right';
};

export const mergeCloudSnapshots = (
  localSnapshot: Record<string, any>,
  remoteSnapshot: Record<string, any>,
  localMetadata: SyncMetadata,
  remoteMetadata: SyncMetadata | undefined,
  remoteUpdatedAt: number,
): { snapshot: Record<string, any>; metadata: SyncMetadata } => {
  const remoteMeta = remoteMetadata || { deviceId: 'legacy-cloud', keys: {} };
  const merged: Record<string, any> = {};
  const metadata: SyncMetadata = { deviceId: localMetadata.deviceId, keys: {} };
  const keys = new Set([...Object.keys(localSnapshot), ...Object.keys(remoteSnapshot)]);

  keys.forEach((key) => {
    const localKey = localMetadata.keys[key];
    const remoteKey = remoteMeta.keys[key] || { updatedAt: remoteUpdatedAt, deviceId: remoteMeta.deviceId };
    const localRecords = recordEntries(key, localSnapshot[key]);
    const remoteRecords = recordEntries(key, remoteSnapshot[key]);
    if (localRecords && remoteRecords) {
      const output = new Map<string, unknown>();
      const records: Record<string, RecordRevision> = {};
      const ids = new Set([...localRecords.keys(), ...remoteRecords.keys(), ...Object.keys(localKey?.records || {}), ...Object.keys(remoteKey.records || {})]);
      ids.forEach((id) => {
        const localRevision = localKey?.records?.[id] || (localRecords.has(id) ? localKey : undefined);
        const remoteRevision = remoteKey.records?.[id] || (remoteRecords.has(id) ? remoteKey : undefined);
        const side = newer(localRevision, remoteRevision);
        const revision = side === 'left' ? localRevision : remoteRevision;
        const value = side === 'left' ? localRecords.get(id) : remoteRecords.get(id);
        if (revision) records[id] = revision;
        if (!revision?.deleted && value !== undefined) output.set(id, value);
      });
      merged[key] = Array.isArray(localSnapshot[key]) || Array.isArray(remoteSnapshot[key])
        ? Array.from(output.values())
        : Object.fromEntries(output);
      metadata.keys[key] = { ...(newer(localKey, remoteKey) === 'left' ? localKey : remoteKey), records } as KeyRevision;
    } else {
      const side = newer(localKey, remoteKey);
      merged[key] = side === 'left' ? localSnapshot[key] : remoteSnapshot[key];
      metadata.keys[key] = (side === 'left' ? localKey : remoteKey) as KeyRevision;
    }
  });
  return { snapshot: merged, metadata };
};
