import { defineConfig } from 'vite';

export default defineConfig({
  base: '/orbit-crafter/',
  server: { port: 5173 },
  build: { target: 'esnext' },
});
