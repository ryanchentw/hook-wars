import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { devPort, serverPort } from './devPort.ts';

const port = devPort();

export default defineConfig({
  plugins: [react()],
  // In development the rooms are a second process; in production one service serves both, on one origin.
  server: { port, strictPort: true, proxy: { '/ws': { target: `ws://127.0.0.1:${serverPort()}`, ws: true } } },
  preview: { port, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
