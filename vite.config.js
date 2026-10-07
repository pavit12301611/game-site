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
    // Online play's backend lives at the same origin as the site (Vercel serverless functions in
    // api/). In `npm run dev` there is no such function, so the same-origin calls are forwarded to
    // `vercel dev`, which runs both the Vite dev server and the api/ functions locally. Plain
    // `npm run dev` without `vercel dev` still serves local practice; online actions then report
    // the backend as not answering, which is exactly the honest answer.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
  },
}));
