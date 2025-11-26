import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './tests',  // Changed from './test/e2e' to './tests' for new test suite
  testMatch: '**/*.spec.ts',  // Match all .spec.ts files
  fullyParallel: true,  // Changed to true - new tests are independent
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 3,  // Run 3 tests in parallel for faster execution
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  timeout: 60000, // 1 minute per test (fast automated tests)

  use: {
    baseURL: 'http://localhost:5173',  // Always use localhost for tests
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,      // Headless by default (use --headed flag to show browser)
    navigationTimeout: 30000,  // 30 second timeout for all navigations
    actionTimeout: 10000,      // 10 second timeout for actions
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only use webServer for local tests
  ...(process.env.TEST_ENV === 'local' ? {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  } : {}),
});
