import { defineConfig } from 'vitest/config'

// Hermetic configuration: Vite must not read .env files for verification tests.
export default defineConfig({
  envDir: false,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setupTests.ts'],
    exclude: ['**/tests/e2e/**', '**/node_modules/**'],
  },
})
