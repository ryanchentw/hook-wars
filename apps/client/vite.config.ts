import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { devPort } from './devPort.ts';

const port = devPort();

export default defineConfig({
  plugins: [react()],
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
