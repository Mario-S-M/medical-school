import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './pruebas',
  testMatch: '**/*.spec.ts',
  globalSetup: './pruebas/ayudas/preparar.ts',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
  },
});
