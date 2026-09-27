import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is called through /api so the dev server and a production
    // single-origin deployment behave identically.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  // No source maps in production: they add ~2.6 MB to the deploy, slow the
  // build on a small instance, and publish the unminified source.
  build: { outDir: 'dist', sourcemap: false },
});
