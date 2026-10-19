import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

// Extended UserConfig type for Vitest support without unresolved imports
type VitestUserConfig = UserConfig & {
  test?: {
    environment?: string;
    setupFiles?: string | string[];
    css?: boolean;
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
} as VitestUserConfig);