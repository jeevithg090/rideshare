import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPhone, formatTime, plural } from '../src/format.js';

describe('formatTime', () => {
  it.each([
    ['00:05', '12:05 AM'],
    ['08:30', '8:30 AM'],
    ['12:00', '12:00 PM'],
    ['18:45', '6:45 PM'],
    ['bad', 'bad'],
  ])('%s -> %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe('formatCurrency', () => {
  it('uses rupees with Indian grouping and up to two decimals', () => {
    expect(formatCurrency(150)).toBe('₹150');
    expect(formatCurrency(33.33)).toBe('₹33.33');
    expect(formatCurrency(123456)).toBe('₹1,23,456');
  });
});

describe('formatPhone', () => {
  it('groups Indian numbers and leaves others alone', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone('+14155550100')).toBe('+14155550100');
  });
});

describe('plural', () => {
  it('pluralises', () => {
    expect(plural(1, 'seat')).toBe('1 seat');
    expect(plural(3, 'seat')).toBe('3 seats');
  });
});
