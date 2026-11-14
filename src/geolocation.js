/**
 * "Use my location" support. The browser Geolocation API provides
 * coordinates; if a Google Maps API key is configured the coordinates are
 * reverse-geocoded into a street address, otherwise they are shown as-is.
 */

export class LocationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'LocationError';
  }
}

const GEO_MESSAGES = {
  1: 'Location permission was denied. Please type your pickup point instead.',
  2: 'Your location is unavailable right now. Please type your pickup point instead.',
  3: 'Finding your location took too long. Please try again or type it in.',
};

/** Formats coordinates as a readable fallback label. */
export function formatCoordinates({ latitude, longitude }) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/**
 * @param {Geolocation | undefined} geolocation
 * @returns {Promise<GeolocationCoordinates>}
 */
export function getPosition(geolocation, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationError('Your browser does not support location access.'));
      return;
    }
    geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) =>
        reject(new LocationError(GEO_MESSAGES[error.code] ?? 'Could not get your location.')),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

let mapsPromise = null;

/**
 * Loads the Google Maps JS API once. Resolves to the geocoding library, or
 * null when no key is configured or the script fails to load.
 * @param {string | undefined} apiKey
 */
export function loadGeocoder(apiKey) {
  if (!apiKey) return Promise.resolve(null);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve) => {
    const callbackName = '__rideshareMapsReady';
    window[callbackName] = async () => {
      try {
        const { Geocoder } = await window.google.maps.importLibrary('geocoding');
        resolve(new Geocoder());
      } catch {
        resolve(null);
      }
    };
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: apiKey, loading: 'async', callback: callbackName });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return mapsPromise;
}

/**
 * @param {{ geocode: Function } | null} geocoder
 * @param {GeolocationCoordinates} coords
 */
export async function describeLocation(geocoder, coords) {
  if (!geocoder) return formatCoordinates(coords);
  try {
    const { results } = await geocoder.geocode({
      location: { lat: coords.latitude, lng: coords.longitude },
    });
    return results?.[0]?.formatted_address ?? formatCoordinates(coords);
  } catch {
    return formatCoordinates(coords);
  }
}
