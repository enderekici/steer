import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,

    include: ['test/**/*.test.ts'],

    exclude: [
      'node_modules/**',
      'dist/**',
      '**/*.config.ts',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'dist/**',
        'node_modules/**',
        'test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        'src/index.ts',
      ],
      all: true,
      clean: true,
    },
  },
});
