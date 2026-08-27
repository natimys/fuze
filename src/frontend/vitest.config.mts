import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  define: { __FUZE_DESKTOP_BUILD__: false },
  plugins: [react()],
  resolve: { alias: { '@': import.meta.dirname } },
  test: {
    include: ['./test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    maxWorkers: 2,
  },
})
