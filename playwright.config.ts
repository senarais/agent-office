import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests', testMatch: '**/game.spec.ts', fullyParallel: false, workers: 1,
  timeout: 180000, expect: { timeout: 15000 }, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175', viewport: { width: 1440, height: 900 }, actionTimeout: 15000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined) },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 30000, env: { PORT: '3101', GAME_PORT: '5175', DATA_DIR: join(tmpdir(), `pt-office-e2e-${Date.now()}`), ENABLE_DEMO_PROVIDER: 'true' } },
});
