import { defineConfig } from 'vite';
import { firebaseEnvCheckPlugin } from './scripts/firebase-env-check.js';

export default defineConfig(({ mode }) => ({
  plugins: [firebaseEnvCheckPlugin()],
  define: {
    // Shown in the setup dialog so you can tell WHICH deployment you are looking at.
    // Contains no config values and no secrets.
    __PSD_BUILD__: JSON.stringify({
      mode,
      vercelEnv: process.env.VERCEL_ENV || '',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
      builtAt: new Date().toISOString(),
    }),
  },
  build: {
    rollupOptions: {
      input: { index: 'index.html', drive: 'drive.html', play: 'play.html', collection: 'collection.html', challenge: 'challenge.html' },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@firebase/') || id.includes('/node_modules/firebase/')) return 'firebase-vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
  },
}));
