import { test, expect, type APIRequestContext } from '@playwright/test';
import { createUser, deleteUser, newTestUser, signInAndCreateOrg } from './helpers';

/**
 * The product doing what it sells, and tenants never seeing each other:
 * organization A stores its own Gemini key, creates an agent and runs it (a real model call);
 * organization B cannot read, change, run or delete anything of A's.
 * Then the plan limit: creating past the limit answers 402 and Billing shows the count.
 */

const a = newTestUser();
const b = newTestUser();
const ids: string[] = [];

test.beforeAll(async () => {
  ids.push(await createUser(a.email, a.password), await createUser(b.email, b.password));
});
test.afterAll(async () => {
  for (const id of ids) await deleteUser(id).catch((err) => console.error('cleanup (user):', err));
});

/** Wait for an agent turn: 200 with the result, or 202 while it runs. */
async function finishTurn(request: APIRequestContext, first: { status: number; body: any }) {
  let res = first;
  for (let i = 0; res.status === 202 && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3_000));
    const poll = await request.get(`/api/v1/agent-runs/${res.body.id ?? res.body.run_id}`);
    res = { status: poll.status(), body: await poll.json() };
  }
  return res;
}

test('an organization runs its own agent with its own key, and another organization cannot touch it', async ({ browser }) => {
  test.skip(!process.env.E2E_LLM_KEY, 'E2E_LLM_KEY (a Gemini test key) is not configured');
  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  await signInAndCreateOrg(pageA, a);
  await signInAndCreateOrg(pageB, b);

  // A brings its own key (tested against Gemini before it is stored) and creates an agent.
  const secret = await pageA.request.post('/api/v1/secrets', { data: { provider: 'gemini', secretValue: process.env.E2E_LLM_KEY } });
  expect(secret.ok(), await secret.text()).toBeTruthy();
  const created = await pageA.request.post('/api/v1/agent-sessions', { data: { name: 'E2E agent', allowed_tools: [], instructions: 'Answer in one word.' } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const agent = await created.json();
  const agentId: string = agent.session.id;

  // The agent runs: a real model call with A's key.
  const start = await pageA.request.post('/api/v1/chat/generate', { data: { session_id: agentId, message: 'Reply with exactly the word PONG.' } });
  const turn = await finishTurn(pageA.request, { status: start.status(), body: await start.json() });
  expect(turn.status, JSON.stringify(turn.body).slice(0, 500)).toBe(200);
  expect(String(turn.body.message ?? '').toUpperCase()).toContain('PONG');
  const runId: string = turn.body.run_id;

  // B sees none of it and can do nothing with it.
  const list = await (await pageB.request.get('/api/v1/agent-sessions')).json();
  expect(JSON.stringify(list)).not.toContain(agentId);
  expect((await pageB.request.get(`/api/v1/agent-sessions/${agentId}`)).status()).toBe(404);
  expect((await pageB.request.patch(`/api/v1/agent-sessions/${agentId}`, { data: { name: 'taken over' } })).status()).toBe(404);
  expect((await pageB.request.post('/api/v1/chat/generate', { data: { session_id: agentId, message: 'hi' } })).status()).toBe(404);
  expect((await pageB.request.get(`/api/v1/agent-runs/${runId}`)).status()).toBe(404);
  expect((await pageB.request.delete(`/api/v1/agent-sessions/${agentId}`)).status()).toBe(404);
  const usageB = await (await pageB.request.get('/api/v1/account/usage')).json();
  expect(usageB.used.agents).toBe(0);
  expect(usageB.used.llm_keys).toBe(0);

  // A's agent is untouched.
  const again = await (await pageA.request.get(`/api/v1/agent-sessions/${agentId}`)).json();
  expect(JSON.stringify(again)).toContain('E2E agent');

  // Cleanup through the product: remove the key, then both organizations.
  expect((await pageA.request.delete('/api/v1/secrets?provider=gemini')).ok()).toBeTruthy();
  for (const [page, user] of [[pageA, a], [pageB, b]] as const) {
    expect((await page.request.post('/api/v1/account/delete', { data: { confirm: user.org } })).ok()).toBeTruthy();
  }
});

test('creating past the plan limit is refused with 402 and Billing shows the count', async ({ page }) => {
  const c = newTestUser();
  const id = await createUser(c.email, c.password);
  try {
    await signInAndCreateOrg(page, c);
    const usage = await (await page.request.get('/api/v1/account/usage')).json();
    // API keys need nothing else to exist (teams need an AI key); create up to the limit, then one more.
    const limit: number = usage.limits.api_keys;
    const key = (n: number) => ({ name: `E2E key ${n}`, environment: 'test', expiresInDays: 1 });
    for (let i = 0; i < limit; i++) {
      const r = await page.request.post('/api/v1/api-keys', { data: key(i) });
      expect(r.ok(), await r.text()).toBeTruthy();
    }
    const over = await page.request.post('/api/v1/api-keys', { data: key(limit) });
    expect(over.status()).toBe(402);
    const body = await over.json();
    expect(body.code).toBe('RESOURCE_LIMIT_REACHED');
    expect(body.limit).toBe(limit);
    expect(body.upgrade).toBe(true);

    await page.getByText('Account & Billing', { exact: true }).click();
    await page.getByRole('button', { name: 'Billing & Plans' }).click();
    await expect(page.getByText(`${limit} / ${limit}`).first()).toBeVisible();

    expect((await page.request.post('/api/v1/account/delete', { data: { confirm: c.org } })).ok()).toBeTruthy();
  } finally {
    // Must succeed: a user who created API keys can still be deleted (erasure requests).
    await deleteUser(id);
  }
});
