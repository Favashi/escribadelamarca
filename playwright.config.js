// Pruebas del flujo principal contra un Supabase local (supabase start) con el login simulado.
// Ver tests/e2e/fixtures.js y docs/DESARROLLO.md → «Tests».
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'móvil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node tests/e2e/serve.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
