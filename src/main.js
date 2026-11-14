import './styles.css';
import { createApp } from './app.js';

createApp({
  root: document,
  storage: safeLocalStorage(),
  geolocation: navigator.geolocation,
  mapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
