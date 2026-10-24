import crypto from 'crypto';

/** Throwaway accounts and Stripe test data for the end-to-end tests. */

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required for the end-to-end tests`);
  return v;
};

export function newTestUser() {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  return { email: `e2e+${stamp}@contextcontrol.com.mx`, password: `E2e-${crypto.randomBytes(12).toString('base64url')}`, org: `E2E ${stamp}` };
}

async function supabaseAdmin(path: string, init: RequestInit = {}) {
  const key = env('E2E_SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('E2E_SUPABASE_URL')}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Supabase admin ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** A confirmed account (no confirmation email needed). Returns its id. */
export async function createUser(email: string, password: string): Promise<string> {
  const user = await supabaseAdmin('users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  return user.id;
}

export async function deleteUser(id: string) {
  await supabaseAdmin(`users/${id}`, { method: 'DELETE' });
}

async function stripe(path: string, method = 'GET', body?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env('E2E_STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Cancel and delete the Stripe test customers created for this email. */
export async function removeStripeCustomer(email: string) {
  if (!env('E2E_STRIPE_SECRET_KEY').startsWith('sk_test_')) throw new Error('E2E_STRIPE_SECRET_KEY must be a test-mode key');
  const customers = await stripe(`customers?email=${encodeURIComponent(email)}&limit=10`);
  for (const c of customers.data as Array<{ id: string }>) {
    const subs = await stripe(`subscriptions?customer=${c.id}&status=all&limit=10`);
    for (const s of subs.data as Array<{ id: string; status: string }>) if (s.status !== 'canceled') await stripe(`subscriptions/${s.id}`, 'DELETE');
    await stripe(`customers/${c.id}`, 'DELETE');
  }
}

/** Sign in through the login page and create the organization in onboarding; ends on the dashboard. */
export async function signInAndCreateOrg(page: import('@playwright/test').Page, user: { email: string; password: string; org: string }) {
  const { expect } = await import('@playwright/test');
  await page.goto('/login');
  await page.getByPlaceholder('name@company.com').fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByPlaceholder('e.g. Acme Global Logistics').fill(user.org);
  await page.getByRole('button', { name: /Continue to BYOK Keys/ }).click();
  await page.getByRole('button', { name: /Continue to Telephony/ }).click();
  await page.getByRole('button', { name: /Complete Setup/ }).click();
  await expect(page).toHaveURL(/\/organizations/);
  await page.getByText(user.org).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
