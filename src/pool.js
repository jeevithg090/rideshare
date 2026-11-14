/**
 * Pure carpool domain logic. Nothing in this module touches the DOM or
 * storage, so it can be unit-tested in isolation.
 *
 * A pool is a single shared trip. The host enters the total fare for the
 * trip, and that fare is split equally across every occupied seat.
 *
 * @typedef {'host' | 'rider'} RiderRole
 *
 * @typedef {object} Rider
 * @property {string} name
 * @property {string} phone   Normalised phone number (digits, optional leading +).
 * @property {number} seats   Seats this rider's party occupies.
 * @property {RiderRole} role
 *
 * @typedef {object} Pool
 * @property {string} id
 * @property {string} pickup
 * @property {string} drop
 * @property {string} time      Departure time as "HH:MM" (24h).
 * @property {number} fare      Total trip fare in rupees.
 * @property {number} capacity  Maximum number of seats.
 * @property {Rider[]} riders   riders[0] is always the host.
 * @property {number} createdAt Unix epoch milliseconds.
 */

/** Seats available in a standard car pool, including the host. */
export const MAX_SEATS = 4;

export class PoolError extends Error {
  /**
   * @param {string} message
   * @param {'POOL_FULL' | 'NOT_ENOUGH_SEATS' | 'ALREADY_JOINED' | 'INVALID_SEATS'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'PoolError';
    this.code = code;
  }
}

/** Round to whole paise so displayed fares never show float noise. */
export function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

/** @param {Pool} pool */
export function seatsTaken(pool) {
  return pool.riders.reduce((total, rider) => total + rider.seats, 0);
}

/** @param {Pool} pool */
export function seatsLeft(pool) {
  return Math.max(pool.capacity - seatsTaken(pool), 0);
}

/** @param {Pool} pool */
export function isFull(pool) {
  return seatsLeft(pool) === 0;
}

/**
 * Current fare per occupied seat.
 * @param {Pool} pool
 */
export function farePerSeat(pool) {
  const taken = seatsTaken(pool);
  return taken === 0 ? pool.fare : roundCurrency(pool.fare / taken);
}

/**
 * Fare per seat once `extraSeats` more seats are filled. Lets a rider see
 * what they will pay before joining.
 * @param {Pool} pool
 * @param {number} extraSeats
 */
export function farePerSeatAfterJoin(pool, extraSeats) {
  return roundCurrency(pool.fare / (seatsTaken(pool) + extraSeats));
}

/** Lowest possible fare per seat, reached when the pool is full. */
export function minimumFarePerSeat(pool) {
  return roundCurrency(pool.fare / pool.capacity);
}

/** Generates a reasonably unique id without depending on crypto support. */
export function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `pool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} input
 * @param {{ name: string, phone: string }} input.host
 * @param {string} input.pickup
 * @param {string} input.drop
 * @param {string} input.time
 * @param {number} input.fare
 * @param {number} input.partySize  Seats the host's own party occupies.
 * @param {{ id?: string, now?: number, capacity?: number }} [options]
 * @returns {Pool}
 */
export function createPool(input, options = {}) {
  const capacity = options.capacity ?? MAX_SEATS;
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize >= capacity) {
    throw new PoolError(
      `Your party can take between 1 and ${capacity - 1} seats.`,
      'INVALID_SEATS',
    );
  }

  return {
    id: options.id ?? generateId(),
    pickup: input.pickup.trim(),
    drop: input.drop.trim(),
    time: input.time,
    fare: roundCurrency(input.fare),
    capacity,
    riders: [
      {
        name: input.host.name.trim(),
        phone: input.host.phone,
        seats: input.partySize,
        role: 'host',
      },
    ],
    createdAt: options.now ?? Date.now(),
  };
}

/**
 * Returns a new pool with the rider added. Never mutates the input.
 * @param {Pool} pool
 * @param {{ name: string, phone: string, seats: number }} rider
 * @returns {Pool}
 */
export function joinPool(pool, rider) {
  if (!Number.isInteger(rider.seats) || rider.seats < 1) {
    throw new PoolError('Choose at least one seat.', 'INVALID_SEATS');
  }
  if (isFull(pool)) {
    throw new PoolError('This pool is already full.', 'POOL_FULL');
  }
  const left = seatsLeft(pool);
  if (rider.seats > left) {
    throw new PoolError(
      `Only ${left} seat${left === 1 ? '' : 's'} left in this pool.`,
      'NOT_ENOUGH_SEATS',
    );
  }
  if (pool.riders.some((existing) => existing.phone === rider.phone)) {
    throw new PoolError('This phone number is already in the pool.', 'ALREADY_JOINED');
  }

  return {
    ...pool,
    riders: [
      ...pool.riders,
      { name: rider.name.trim(), phone: rider.phone, seats: rider.seats, role: 'rider' },
    ],
  };
}

/**
 * Removes a non-host rider. The host cannot leave; they cancel the pool.
 * @param {Pool} pool
 * @param {string} phone
 * @returns {Pool}
 */
export function leavePool(pool, phone) {
  return {
    ...pool,
    riders: pool.riders.filter((rider) => rider.role === 'host' || rider.phone !== phone),
  };
}

/** @param {Pool} pool */
export function hostOf(pool) {
  return pool.riders.find((rider) => rider.role === 'host') ?? pool.riders[0];
}

/**
 * Orders pools by departure time, earliest first, then by creation time.
 * @param {Pool[]} pools
 */
export function sortPools(pools) {
  return [...pools].sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt);
}
