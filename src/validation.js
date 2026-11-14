/**
 * Form validation. Each validator returns `{ values, errors }` where
 * `values` holds cleaned, typed data and `errors` maps a field name to a
 * human-readable message. An empty `errors` object means the input is valid.
 */

import { MAX_SEATS } from './pool.js';

export const LIMITS = {
  nameMin: 2,
  nameMax: 50,
  placeMax: 120,
  fareMax: 100000,
};

/**
 * Strips spaces, dashes, dots and brackets, keeping an optional leading "+".
 * Returns null when the result is not a plausible phone number (7–15 digits,
 * per E.164).
 * @param {string} raw
 */
export function normalizePhone(raw) {
  const trimmed = String(raw ?? '').trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const rest = plus ? trimmed.slice(1) : trimmed;
  if (!/^[\d\s\-().]+$/.test(rest)) {
    return null;
  }
  const digits = rest.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }
  return plus + digits;
}

function validateName(raw, errors, field = 'name') {
  const name = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!name) {
    errors[field] = 'Please enter your name.';
  } else if (name.length < LIMITS.nameMin) {
    errors[field] = `Name must be at least ${LIMITS.nameMin} characters.`;
  } else if (name.length > LIMITS.nameMax) {
    errors[field] = `Name must be ${LIMITS.nameMax} characters or fewer.`;
  }
  return name;
}

function validatePhone(raw, errors, field = 'phone') {
  if (!String(raw ?? '').trim()) {
    errors[field] = 'Please enter your phone number.';
    return '';
  }
  const phone = normalizePhone(raw);
  if (!phone) {
    errors[field] = 'Enter a valid phone number, e.g. +91 98765 43210.';
    return '';
  }
  return phone;
}

function validateSeats(raw, max, errors, field = 'seats') {
  const seats = Number(raw);
  if (!Number.isInteger(seats) || seats < 1 || seats > max) {
    errors[field] = `Choose between 1 and ${max} seat${max === 1 ? '' : 's'}.`;
  }
  return seats;
}

/**
 * @param {Record<string, unknown>} input Raw form values.
 */
export function validatePoolForm(input) {
  /** @type {Record<string, string>} */
  const errors = {};

  const pickup = String(input.pickup ?? '').trim();
  const drop = String(input.drop ?? '').trim();
  if (!pickup) errors.pickup = 'Please enter a pickup location.';
  else if (pickup.length > LIMITS.placeMax) errors.pickup = 'Pickup location is too long.';
  if (!drop) errors.drop = 'Please enter a drop location.';
  else if (drop.length > LIMITS.placeMax) errors.drop = 'Drop location is too long.';
  if (pickup && drop && pickup.toLowerCase() === drop.toLowerCase()) {
    errors.drop = 'Drop location must be different from pickup.';
  }

  const time = String(input.time ?? '').trim();
  if (!time) errors.time = 'Please choose a departure time.';
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Enter a valid time.';

  const fareText = String(input.fare ?? '').trim();
  const fare = Number(fareText);
  if (!fareText) errors.fare = 'Please enter the total trip fare.';
  else if (!Number.isFinite(fare) || fare <= 0) errors.fare = 'Fare must be more than ₹0.';
  else if (fare > LIMITS.fareMax) {
    errors.fare = `Fare must be ₹${LIMITS.fareMax.toLocaleString('en-IN')} or less.`;
  }

  const partySize = validateSeats(input.partySize, MAX_SEATS - 1, errors, 'partySize');
  const name = validateName(input.name, errors);
  const phone = validatePhone(input.phone, errors);

  return {
    values: { pickup, drop, time, fare, partySize, host: { name, phone } },
    errors,
  };
}

/**
 * @param {Record<string, unknown>} input Raw form values.
 * @param {number} maxSeats Seats still available in the pool.
 */
export function validateJoinForm(input, maxSeats) {
  /** @type {Record<string, string>} */
  const errors = {};
  const name = validateName(input.name, errors);
  const phone = validatePhone(input.phone, errors);
  const seats = validateSeats(input.seats, Math.max(maxSeats, 1), errors);
  return { values: { name, phone, seats }, errors };
}
