import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a deployed environment (staging, after each deploy). They create a
 * throwaway account through the Supabase admin API and remove everything they created.
 * E2E_BASE_URL, E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_STRIPE_SECRET_KEY.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
