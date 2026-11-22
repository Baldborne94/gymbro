import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'web',
          include: ['tests/unit/web/**/*.test.ts'],
          environment: 'happy-dom',
          setupFiles: ['tests/support/setup-web.ts'],
        },
      },
      {
        test: {
          name: 'server',
          include: ['tests/unit/server/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/support/setup-server.ts'],
        },
      },
      {
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
