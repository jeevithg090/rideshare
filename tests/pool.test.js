import { describe, expect, it } from 'vitest';
import {
  MAX_SEATS,
  PoolError,
  createPool,
  farePerSeat,
  farePerSeatAfterJoin,
  hostOf,
  isFull,
  joinPool,
  leavePool,
  minimumFarePerSeat,
  seatsLeft,
  seatsTaken,
  sortPools,
} from '../src/pool.js';

const base = {
  host: { name: '  Asha ', phone: '+919000000001' },
  pickup: ' Koramangala ',
  drop: 'MG Road',
  time: '08:30',
  fare: 600,
  partySize: 1,
};

const make = (overrides = {}, options = {}) =>
  createPool({ ...base, ...overrides }, { id: 'p1', now: 1000, ...options });

describe('createPool', () => {
  it('creates a pool with the host as the first rider', () => {
    const pool = make();
    expect(pool).toEqual({
      id: 'p1',
      pickup: 'Koramangala',
      drop: 'MG Road',
      time: '08:30',
      fare: 600,
      capacity: MAX_SEATS,
      riders: [{ name: 'Asha', phone: '+919000000001', seats: 1, role: 'host' }],
      createdAt: 1000,
    });
  });

  it('reserves seats for the host party', () => {
    const pool = make({ partySize: 3 });
    expect(seatsTaken(pool)).toBe(3);
    expect(seatsLeft(pool)).toBe(1);
  });

  it.each([0, 4, 1.5, NaN])('rejects a party size of %s', (partySize) => {
    expect(() => make({ partySize })).toThrow(PoolError);
  });

  it('generates an id when none is given', () => {
    const a = createPool(base);
    const b = createPool(base);
    expect(a.id).toBeTypeOf('string');
    expect(a.id).not.toBe(b.id);
  });
});

describe('fare splitting', () => {
  it('charges the host the full fare while alone', () => {
    expect(farePerSeat(make())).toBe(600);
  });

  it('splits the total fare across all occupied seats', () => {
    const pool = joinPool(make(), { name: 'Ravi', phone: '9000000002', seats: 2 });
    expect(farePerSeat(pool)).toBe(200);
  });

  it('rounds to paise', () => {
    const pool = joinPool(make({ fare: 100 }), { name: 'Ravi', phone: '9000000002', seats: 2 });
    expect(farePerSeat(pool)).toBe(33.33);
  });

  it('previews the fare after joining', () => {
    expect(farePerSeatAfterJoin(make(), 1)).toBe(300);
    expect(farePerSeatAfterJoin(make(), 3)).toBe(150);
  });

  it('computes the minimum fare when full', () => {
    expect(minimumFarePerSeat(make())).toBe(150);
  });
});

describe('joinPool', () => {
  it('adds a rider without mutating the original pool', () => {
    const pool = make();
    const joined = joinPool(pool, { name: ' Ravi ', phone: '9000000002', seats: 1 });
    expect(pool.riders).toHaveLength(1);
    expect(joined.riders).toHaveLength(2);
    expect(joined.riders[1]).toEqual({
      name: 'Ravi',
      phone: '9000000002',
      seats: 1,
      role: 'rider',
    });
    // The host must stay the host — the original code overwrote host details with each joiner.
    expect(hostOf(joined).name).toBe('Asha');
  });

  it('rejects joining a full pool', () => {
    const full = joinPool(make({ partySize: 3 }), { name: 'Ravi', phone: '9000000002', seats: 1 });
    expect(isFull(full)).toBe(true);
    expect(() => joinPool(full, { name: 'Meera', phone: '9000000003', seats: 1 })).toThrow(
      expect.objectContaining({ code: 'POOL_FULL' }),
    );
  });

  it('rejects requesting more seats than are left', () => {
    expect(() =>
      joinPool(make({ partySize: 2 }), { name: 'Ravi', phone: '9000000002', seats: 3 }),
    ).toThrow(
      expect.objectContaining({
        code: 'NOT_ENOUGH_SEATS',
        message: 'Only 2 seats left in this pool.',
      }),
    );
  });

  it('rejects a phone number already in the pool', () => {
    expect(() => joinPool(make(), { name: 'Asha 2', phone: '+919000000001', seats: 1 })).toThrow(
      expect.objectContaining({ code: 'ALREADY_JOINED' }),
    );
  });

  it('rejects zero seats', () => {
    expect(() => joinPool(make(), { name: 'Ravi', phone: '9000000002', seats: 0 })).toThrow(
      expect.objectContaining({ code: 'INVALID_SEATS' }),
    );
  });
});

describe('leavePool', () => {
  it('removes a rider but never the host', () => {
    const joined = joinPool(make(), { name: 'Ravi', phone: '9000000002', seats: 1 });
    expect(leavePool(joined, '9000000002').riders).toHaveLength(1);
    expect(leavePool(joined, '+919000000001').riders).toHaveLength(2);
  });
});

describe('sortPools', () => {
  it('orders by departure time, then creation time, without mutating', () => {
    const pools = [
      make({ time: '18:00' }, { id: 'late' }),
      make({ time: '07:00' }, { id: 'early-b', now: 2 }),
      make({ time: '07:00' }, { id: 'early-a', now: 1 }),
    ];
    expect(sortPools(pools).map((p) => p.id)).toEqual(['early-a', 'early-b', 'late']);
    expect(pools[0].id).toBe('late');
  });
});
