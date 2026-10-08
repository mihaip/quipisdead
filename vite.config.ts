import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      auxiliaryWorkers: [{ configPath: 'wrangler.capture.jsonc' }],
      remoteBindings: false,
      persistState: { path: process.env.QUIP_LOCAL_STATE_PATH ?? '.wrangler/state' },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
