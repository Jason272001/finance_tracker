const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8766',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `${process.platform === 'win32' ? 'python' : 'python3'} -m http.server 8766 --bind 127.0.0.1`,
    port: 8766,
    reuseExistingServer: !process.env.CI,
  },
});
