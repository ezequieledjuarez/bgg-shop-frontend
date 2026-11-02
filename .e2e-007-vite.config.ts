import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

export default defineConfig(() =>
  mergeConfig(baseConfig, {
    server: {
      host: '127.0.0.1',
      port: 13008,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:15000',
          changeOrigin: true,
        },
      },
    },
  }),
)
