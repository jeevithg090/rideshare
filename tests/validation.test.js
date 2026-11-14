import { describe, expect, it } from 'vitest';
import { normalizePhone, validateJoinForm, validatePoolForm } from '../src/validation.js';

const valid = {
  pickup: 'Koramangala',
  drop: 'MG Road',
  time: '08:30',
  fare: '600',
  partySize: '1',
  name: 'Asha',
  phone: '+91 98765 43210',
};

describe('normalizePhone', () => {
  it.each([
    ['+91 98765 43210', '+919876543210'],
    ['98765-43210', '9876543210'],
    ['(080) 1234 5678', '08012345678'],
    ['  +1 415.555.0100 ', '+14155550100'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '123', 'call me', '+91 98765 4321O', '1'.repeat(16), '++919876543210'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe('validatePoolForm', () => {
  it('accepts valid input and returns typed values', () => {
    const { values, errors } = validatePoolForm(valid);
    expect(errors).toEqual({});
    expect(values).toEqual({
      pickup: 'Koramangala',
      drop: 'MG Road',
      time: '08:30',
      fare: 600,
      partySize: 1,
      host: { name: 'Asha', phone: '+919876543210' },
    });
  });

  it('reports every missing field', () => {
    const { errors } = validatePoolForm({});
    expect(Object.keys(errors).sort()).toEqual(
      ['drop', 'fare', 'name', 'partySize', 'phone', 'pickup', 'time'].sort(),
    );
  });

  it('rejects identical pickup and drop', () => {
    const { errors } = validatePoolForm({ ...valid, drop: ' koramangala ' });
    expect(errors.drop).toMatch(/different/);
  });

  it.each(['0', '-50', 'abc', '100001'])('rejects a fare of %s', (fare) => {
    expect(validatePoolForm({ ...valid, fare }).errors.fare).toBeDefined();
  });

  it.each(['24:00', '8:30', 'noon'])('rejects a time of %s', (time) => {
    expect(validatePoolForm({ ...valid, time }).errors.time).toBeDefined();
  });

  it('caps the host party below pool capacity', () => {
    expect(validatePoolForm({ ...valid, partySize: '4' }).errors.partySize).toBeDefined();
    expect(validatePoolForm({ ...valid, partySize: '3' }).errors.partySize).toBeUndefined();
  });

  it('collapses whitespace in names and enforces length', () => {
    expect(validatePoolForm({ ...valid, name: '  Asha   Rao ' }).values.host.name).toBe('Asha Rao');
    expect(validatePoolForm({ ...valid, name: 'A' }).errors.name).toBeDefined();
    expect(validatePoolForm({ ...valid, name: 'A'.repeat(51) }).errors.name).toBeDefined();
  });
});

describe('validateJoinForm', () => {
  it('limits seats to those still available', () => {
    const input = { name: 'Ravi', phone: '9876543210', seats: '3' };
    expect(validateJoinForm(input, 3).errors).toEqual({});
    expect(validateJoinForm(input, 2).errors.seats).toBe('Choose between 1 and 2 seats.');
  });

  it('requires a valid phone', () => {
    expect(validateJoinForm({ name: 'Ravi', phone: '12', seats: '1' }, 3).errors.phone).toMatch(
      /valid phone/,
    );
  });
});
