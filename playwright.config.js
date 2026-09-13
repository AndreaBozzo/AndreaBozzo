const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  webServer: {
    command: process.env.SITE_ALREADY_BUILT
      ? 'node ./scripts/serve-static.mjs _site 4174'
      : 'npm run build:site && node ./scripts/serve-static.mjs _site 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 180_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
