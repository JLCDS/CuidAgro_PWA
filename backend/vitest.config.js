import { defineConfig } from 'vitest/config';

export const URL_BD_PRUEBAS = 'postgresql://cuidagro:cuidagro_dev@127.0.0.1:5433/cuidagro_test';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/globalSetup.js'],
    setupFiles: ['tests/setup.js'],
    // Todas las pruebas comparten una base real: una a la vez.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: URL_BD_PRUEBAS,
      JWT_SECRET: 'secreto-solo-para-pruebas-automatizadas-0123456789',
    },
  },
});
