import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/helpers/setup.ts',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321' },
  projects: [
    { name: 'principal', testIgnore: '**/player.spec.ts', use: { browserName: 'chromium' } },
    // El Chromium de Playwright no trae códecs H.264/AAC: el reproductor se prueba con Google Chrome.
    { name: 'video', testMatch: '**/player.spec.ts', use: { browserName: 'chromium', channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
  },
});
