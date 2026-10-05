import assert from 'assert';
import { test, describe } from 'node:test';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/functions/route';

describe('AI Function Studio API (security fix)', () => {
  test('listing and saving functions require a signed-in session', async () => {
    const prevDemo = process.env.DEMO_MODE;
    const prevPublic = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    try {
      // The old route trusted organizationId from the request; it must now be ignored.
      const list = await GET(new NextRequest('https://app.test/api/functions?organizationId=00000000-0000-0000-0000-000000000001'));
      assert.equal(list.status, 401);
      const save = await POST(new NextRequest('https://app.test/api/functions', {
        method: 'POST',
        body: JSON.stringify({ name: 'x', code: 'def main(): pass', organizationId: '00000000-0000-0000-0000-000000000001' }),
      }));
      assert.equal(save.status, 401);
    } finally {
      process.env.DEMO_MODE = prevDemo;
      process.env.NEXT_PUBLIC_DEMO_MODE = prevPublic;
    }
  });
});
