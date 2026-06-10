import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static client-side build, no env vars, no server config.
// Default Vite output (dist/) deploys to Vercel with zero configuration.
export default defineConfig({
  plugins: [react()],
});
