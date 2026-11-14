import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Multi-page app: unknown paths get a real 404 instead of falling back to index.html.
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
