/**
 * Persists app state in localStorage so pools survive a page refresh.
 * Storage can be unavailable (private mode, blocked cookies) or contain
 * stale/corrupt data, so every read and write is defensive.
 */

export const STORAGE_KEY = 'rideshare:state';
export const STORAGE_VERSION = 1;

/**
 * @typedef {object} AppState
 * @property {import('./pool.js').Pool[]} pools
 * @property {Record<string, 'host' | 'rider'>} mine  Pool ids this device created or joined.
 * @property {Record<string, string>} myPhones         Phone used on this device, per pool id.
 */

/** @returns {AppState} */
export function emptyState() {
  return { pools: [], mine: {}, myPhones: {} };
}

function isRider(value) {
  return (
    value &&
    typeof value.name === 'string' &&
    typeof value.phone === 'string' &&
    Number.isInteger(value.seats) &&
    (value.role === 'host' || value.role === 'rider')
  );
}

function isPool(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.pickup === 'string' &&
    typeof value.drop === 'string' &&
    typeof value.time === 'string' &&
    typeof value.fare === 'number' &&
    Number.isInteger(value.capacity) &&
    Array.isArray(value.riders) &&
    value.riders.length > 0 &&
    value.riders.every(isRider)
  );
}

function isStringMap(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

/**
 * Parses serialised state, discarding anything that doesn't match the schema.
 * @param {string | null} raw
 * @returns {AppState}
 */
export function parseState(raw) {
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw);
    if (data?.version !== STORAGE_VERSION) return emptyState();
    const pools = Array.isArray(data.pools) ? data.pools.filter(isPool) : [];
    const ids = new Set(pools.map((pool) => pool.id));
    const pick = (map) =>
      isStringMap(map) ? Object.fromEntries(Object.entries(map).filter(([id]) => ids.has(id))) : {};
    return { pools, mine: pick(data.mine), myPhones: pick(data.myPhones) };
  } catch {
    return emptyState();
  }
}

/** @param {AppState} state */
export function serializeState(state) {
  return JSON.stringify({ version: STORAGE_VERSION, ...state });
}

/**
 * @param {Pick<Storage, 'getItem'> | undefined} storage
 * @returns {AppState}
 */
export function loadState(storage) {
  try {
    return parseState(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return emptyState();
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | undefined} storage
 * @param {AppState} state
 * @returns {boolean} Whether the state was saved.
 */
export function saveState(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, serializeState(state));
    return Boolean(storage);
  } catch {
    return false;
  }
}
