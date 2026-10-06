import assert from 'assert';
import { test, describe } from 'node:test';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/v1/functions/route';
import { POST as DEPLOY } from '../app/api/v1/functions/[id]/deploy/route';
import { POST as TEST } from '../app/api/v1/functions/[id]/test/route';
import { POST as DRAFT } from '../app/api/v1/functions/draft/route';

describe('AI Function Studio API auth', () => {
  test('every function route requires a signed-in session', async () => {
    const prevDemo = process.env.DEMO_MODE;
    const prevPublic = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    const id = '00000000-0000-0000-0000-000000000001';
    const params = { params: Promise.resolve({ id }) };
    const post = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
    try {
      // organizationId in the request is never trusted.
      assert.equal((await GET(new NextRequest(`https://app.test/api/v1/functions?organizationId=${id}`))).status, 401);
      assert.equal((await POST(post('https://app.test/api/v1/functions', { name: 'x', language: 'python', code: 'x', organizationId: id }))).status, 401);
      assert.equal((await DEPLOY(post(`https://app.test/api/v1/functions/${id}/deploy`, {}), params)).status, 401);
      assert.equal((await TEST(post(`https://app.test/api/v1/functions/${id}/test`, { input: {} }), params)).status, 401);
      assert.equal((await DRAFT(post('https://app.test/api/v1/functions/draft', { description: 'add numbers', language: 'python' }))).status, 401);
    } finally {
      process.env.DEMO_MODE = prevDemo;
      process.env.NEXT_PUBLIC_DEMO_MODE = prevPublic;
    }
  });
});
