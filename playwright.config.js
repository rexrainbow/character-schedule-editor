import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:5180', locale: 'en-US', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm.cmd run dev -- --port 5180 --strictPort', url: 'http://127.0.0.1:5180', reuseExistingServer: false },
});
