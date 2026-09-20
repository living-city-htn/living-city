import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Workspace packages are resolved by path rather than by node_modules link, for
 * the same reason as packages/pipeline: a checkout where the package manager
 * could not create symlinks still has to run the tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@living-city/contracts': resolve(__dirname, '../contracts/src/index.ts'),
      '@living-city/map': resolve(__dirname, '../map/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
