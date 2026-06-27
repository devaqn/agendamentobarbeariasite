const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const isLocalhost = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  reporter: [['html', { open: 'never' }], ['list']],

  // Inicia o servidor automaticamente se estiver rodando local
  ...(isLocalhost && {
    webServer: {
      command: 'node backend/server.js',
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 15000
    }
  })
});
