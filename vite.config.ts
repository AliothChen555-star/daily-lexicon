import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: '127.0.0.1', port: 4173, strictPort: true, watch: { ignored: ['**/android/**','**/release/**','**/.toolchain/**','**/test-results/**'] } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
