import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      exclude:  ['src/main.ts', 'src/shaders.d.ts', 'src/shaders/**'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    // Allow `.js` extension imports to resolve `.ts` source files (Vite convention)
    extensions: ['.ts', '.js'],
  },
});
