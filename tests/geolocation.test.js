import { describe, expect, it, vi } from 'vitest';
import {
  LocationError,
  describeLocation,
  formatCoordinates,
  getPosition,
  loadGeocoder,
} from '../src/geolocation.js';

const coords = { latitude: 12.934533, longitude: 77.626579 };

describe('getPosition', () => {
  it('resolves with coordinates', async () => {
    const geo = { getCurrentPosition: (ok) => ok({ coords }) };
    await expect(getPosition(geo)).resolves.toBe(coords);
  });

  it('maps permission errors to a friendly message', async () => {
    const geo = { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) };
    await expect(getPosition(geo)).rejects.toThrow(/permission was denied/);
  });

  it('rejects when geolocation is unsupported', async () => {
    await expect(getPosition(undefined)).rejects.toBeInstanceOf(LocationError);
  });
});

describe('describeLocation', () => {
  it('falls back to coordinates without a geocoder', async () => {
    expect(await describeLocation(null, coords)).toBe('12.93453, 77.62658');
    expect(formatCoordinates(coords)).toBe('12.93453, 77.62658');
  });

  it('uses the first geocoder result', async () => {
    const geocoder = {
      geocode: vi.fn().mockResolvedValue({ results: [{ formatted_address: 'Koramangala' }] }),
    };
    expect(await describeLocation(geocoder, coords)).toBe('Koramangala');
    expect(geocoder.geocode).toHaveBeenCalledWith({
      location: { lat: coords.latitude, lng: coords.longitude },
    });
  });

  it('falls back to coordinates when geocoding fails', async () => {
    const geocoder = { geocode: vi.fn().mockRejectedValue(new Error('ZERO_RESULTS')) };
    expect(await describeLocation(geocoder, coords)).toBe('12.93453, 77.62658');
  });
});

describe('loadGeocoder', () => {
  it('does nothing without an API key', async () => {
    await expect(loadGeocoder(undefined)).resolves.toBeNull();
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
  });
});
