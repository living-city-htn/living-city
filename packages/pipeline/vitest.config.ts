import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Workspace packages are resolved by path rather than by node_modules link.
 * That keeps the tests runnable on a checkout where the package manager could
 * not create symlinks - which includes any non-NTFS drive on Windows.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@living-city/contracts': resolve(__dirname, '../contracts/src/index.ts'),
      '@living-city/fixtures/store': resolve(__dirname, '../fixtures/src/store.ts'),
      '@living-city/fixtures': resolve(__dirname, '../fixtures/src/index.ts'),
      // Reached through the fixtures store, which loads Map's real city.
      '@living-city/map': resolve(__dirname, '../map/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
