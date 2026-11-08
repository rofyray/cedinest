import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8790
const WEB_PORT = 5190

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      command: `API_PORT=${API_PORT} CHAIN_MODE=mock QUOTES_PER_MINUTE=100 DATABASE_URL= SESSION_SECRET=e2e CRON_SECRET=e2e NIM_FEE_ADDRESS="NQ07 0000 0000 0000 0000 0000 0000 0000 0001" npx tsx scripts/dev-api.ts`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `API_PORT=${API_PORT} VITE_MOCK_WALLET=1 npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
