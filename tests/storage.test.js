import { describe, expect, it } from 'vitest';
import { createPool } from '../src/pool.js';
import {
  STORAGE_KEY,
  emptyState,
  loadState,
  parseState,
  saveState,
  serializeState,
} from '../src/storage.js';

const pool = createPool(
  {
    host: { name: 'Asha', phone: '+919000000001' },
    pickup: 'A',
    drop: 'B',
    time: '08:30',
    fare: 600,
    partySize: 1,
  },
  { id: 'p1', now: 1 },
);

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

describe('storage', () => {
  it('round-trips state', () => {
    const storage = memoryStorage();
    const state = { pools: [pool], mine: { p1: 'host' }, myPhones: { p1: '+919000000001' } };
    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage)).toEqual(state);
  });

  it.each([null, '', 'not json', '{"version":99,"pools":[]}', '[]'])(
    'falls back to empty state for %s',
    (raw) => {
      expect(parseState(raw)).toEqual(emptyState());
    },
  );

  it('drops malformed pools and orphaned references', () => {
    const raw = JSON.stringify({
      version: 1,
      pools: [pool, { id: 'bad' }, { ...pool, id: 'p2', riders: [] }],
      mine: { p1: 'host', bad: 'host', ghost: 'rider' },
      myPhones: { p1: '+919000000001', ghost: '1' },
    });
    expect(parseState(raw)).toEqual({
      pools: [pool],
      mine: { p1: 'host' },
      myPhones: { p1: '+919000000001' },
    });
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadState(broken)).toEqual(emptyState());
    expect(saveState(broken, emptyState())).toBe(false);
    expect(loadState(undefined)).toEqual(emptyState());
    expect(saveState(undefined, emptyState())).toBe(false);
  });

  it('stores under a versioned key', () => {
    const storage = memoryStorage();
    saveState(storage, emptyState());
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).version).toBe(1);
    expect(serializeState(emptyState())).toContain('"pools":[]');
  });
});
