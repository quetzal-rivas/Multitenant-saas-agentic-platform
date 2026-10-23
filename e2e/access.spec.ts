import { test, expect } from '@playwright/test';

/** Without credentials nothing is reachable: pages send to login, APIs answer 401/400. */

test('signed-out visitors are sent to login from every app page', async ({ page }) => {
  for (const path of ['/dashboard', '/onboarding']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('the login page only offers what works here', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByPlaceholder('name@company.com')).toBeVisible();
  await expect(page).toHaveTitle(/Context Control/);
});

test('APIs refuse requests without credentials, before looking at the request', async ({ request }) => {
  for (const path of ['/api/v1/account/usage', '/api/v1/agent-sessions', '/api/v1/agent-teams', '/api/v1/account/paused-resources']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    expect((await res.json()).code, path).toBe('UNAUTHORIZED');
  }
  // A malformed body must not get a validation answer (that would describe the API to anyone).
  const resolve = await request.post('/api/v1/context/resolve', { data: {} });
  expect(resolve.status()).toBe(401);

  const mcp = await request.post('/api/mcp/platform', {
    headers: { Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  });
  expect(mcp.status()).toBe(401);

  // Only Stripe (signed) and pg_cron (shared secret) may call these.
  expect((await request.post('/api/webhooks/stripe', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/v1/heartbeats/tick')).status()).toBe(401);
});
