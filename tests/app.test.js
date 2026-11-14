import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { STORAGE_KEY } from '../src/storage.js';

const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function setup({ storage = memoryStorage(), geolocation } = {}) {
  document.body.innerHTML = bodyMarkup;
  const app = createApp({ root: document, storage, geolocation, mapsApiKey: undefined });
  return { app, storage };
}

const $ = (id) => document.getElementById(id);

function fill(id, value) {
  const el = $(id);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(formId) {
  $(formId).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function fillPoolForm(overrides = {}) {
  const values = {
    pickup: 'Koramangala',
    drop: 'MG Road',
    time: '08:30',
    fare: '600',
    name: 'Asha',
    phone: '+91 98765 43210',
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) fill(id, value);
}

describe('app', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('shows an empty state on first load', () => {
    setup();
    expect($('availableList').textContent).toContain('No pools yet');
    expect($('availableCount').textContent).toBe('0');
  });

  it('shows inline errors instead of creating an invalid pool', () => {
    const { app } = setup();
    submit('poolForm');
    expect(app.getState().pools).toHaveLength(0);
    expect($('pickup-error').textContent).toBe('Please enter a pickup location.');
    expect($('pickup').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('pickup'));
  });

  it('clears a field error once the user edits it', () => {
    setup();
    submit('poolForm');
    fill('pickup', 'K');
    expect($('pickup-error').textContent).toBe('');
    expect($('pickup').hasAttribute('aria-invalid')).toBe(false);
  });

  it('creates a pool, persists it and lists it under Your rides', () => {
    const { app, storage } = setup();
    $('poolForm').querySelector('[data-step="1"]').click();
    fillPoolForm();
    submit('poolForm');

    const [pool] = app.getState().pools;
    expect(pool.riders[0]).toMatchObject({ name: 'Asha', phone: '+919876543210', seats: 2 });
    expect(app.getState().mine[pool.id]).toBe('host');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).pools).toHaveLength(1);
    expect($('tab-mine').getAttribute('aria-selected')).toBe('true');
    expect($('panel-mine').hidden).toBe(false);
    expect($('mineList').textContent).toContain('Hosting');
    expect($('mineList').textContent).toContain('₹300'); // 600 split over 2 seats
    expect($('pickup').value).toBe('');
  });

  it('restores pools from storage on reload', () => {
    const { storage } = setup();
    fillPoolForm();
    submit('poolForm');
    const { app } = setup({ storage });
    expect(app.getState().pools).toHaveLength(1);
    expect($('mineCount').textContent).toBe('1');
  });

  it('renders user input as text, never as HTML', () => {
    setup();
    fillPoolForm({ pickup: '<img src=x onerror="window.__xss=1">', name: '<b>Asha</b>' });
    submit('poolForm');
    expect(document.querySelector('#mineList img')).toBeNull();
    expect(document.querySelector('#mineList b')).toBeNull();
    expect($('mineList').textContent).toContain('<img src=x');
    expect(window.__xss).toBeUndefined();
  });

  it('joins a sample pool and recalculates the fare for everyone', () => {
    const { app } = setup();
    $('availableList').querySelector('.empty-state button').click();
    expect(app.getState().pools).toHaveLength(3);

    const morning = [...$('availableList').querySelectorAll('.pool-card')].find((card) =>
      card.textContent.includes('Electronic City'),
    );
    morning.querySelector('.btn-primary').click();
    expect($('joinSeats').options).toHaveLength(3);
    expect($('joinPreview').textContent).toContain('₹300/seat');

    fill('joinName', 'Ravi');
    fill('joinPhone', '98765 00000');
    $('joinSeats').value = '2';
    $('joinSeats').dispatchEvent(new Event('change'));
    expect($('joinPreview').textContent).toContain('₹200/seat');
    submit('joinForm');

    const pool = app.getState().pools.find((p) => p.id === 'sample-morning');
    expect(pool.riders.map((r) => r.name)).toEqual(['Asha', 'Ravi']);
    expect(app.getState().mine['sample-morning']).toBe('rider');
    expect($('mineList').textContent).toContain('Joined');
  });

  it('prevents joining with a phone already in the pool', () => {
    const { app } = setup();
    $('availableList').querySelector('.empty-state button').click();
    const card = [...$('availableList').querySelectorAll('.pool-card')].find((c) =>
      c.textContent.includes('Electronic City'),
    );
    card.querySelector('.btn-primary').click();
    fill('joinName', 'Someone');
    fill('joinPhone', '+91 90000 00001'); // the sample host's number
    submit('joinForm');
    expect($('joinPhone-error').textContent).toMatch(/already in the pool/);
    expect(app.getState().pools.find((p) => p.id === 'sample-morning').riders).toHaveLength(1);
  });

  it('disables joining a full pool', () => {
    setup();
    $('availableList').querySelector('.empty-state button').click();
    const full = [...$('availableList').querySelectorAll('.pool-card')].find((c) =>
      c.textContent.includes('Whitefield'),
    );
    const button = full.querySelector('.btn-primary');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Pool full');
  });

  it('lists riders with call links in the details dialog', () => {
    setup();
    fillPoolForm();
    submit('poolForm');
    [...$('mineList').querySelectorAll('button')].find((b) => b.textContent === 'Details').click();
    const link = $('detailsBody').querySelector('a[href^="tel:"]');
    expect(link.getAttribute('href')).toBe('tel:+919876543210');
    expect(link.getAttribute('aria-label')).toBe('Call Asha on +91 98765 43210');
    expect($('detailsBody').textContent).toContain('You');
  });

  it('supports arrow-key navigation between tabs', () => {
    setup();
    $('tab-available').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect($('tab-mine').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe($('tab-mine'));
    $('tab-mine').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect($('tab-available').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the party size between 1 and 3', () => {
    setup();
    const [minus, plus] = $('poolForm').querySelectorAll('[data-step]');
    expect(minus.disabled).toBe(true);
    plus.click();
    plus.click();
    expect($('partySizeValue').textContent).toBe('3');
    expect(plus.disabled).toBe(true);
  });

  it('fills pickup with coordinates when no Maps key is configured', async () => {
    const geolocation = {
      getCurrentPosition: (ok) => ok({ coords: { latitude: 12.9345, longitude: 77.6266 } }),
    };
    setup({ geolocation });
    $('locateBtn').click();
    await vi.waitFor(() => expect($('pickup').value).toBe('12.93450, 77.62660'));
    expect($('locateBtn').disabled).toBe(false);
  });

  it('shows a friendly toast when location is denied', async () => {
    const geolocation = { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) };
    setup({ geolocation });
    $('locateBtn').click();
    await vi.waitFor(() => expect($('toaster').textContent).toMatch(/permission was denied/));
  });
});
