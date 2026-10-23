import { test, expect, type Page } from '@playwright/test';
import { createUser, deleteUser, newTestUser, removeStripeCustomer } from './helpers';

/**
 * The paths a new customer takes, end to end on the deployed app: sign in, create the
 * organization, open it, see the trial in Billing, buy Developer with Stripe's test card and get
 * the Pro trial, then delete the organization. Everything created is removed afterwards.
 */

const user = newTestUser();
let userId: string | null = null;

test.beforeAll(async () => {
  userId = await createUser(user.email, user.password);
});

test.afterAll(async () => {
  await removeStripeCustomer(user.email).catch((err) => console.error('cleanup (Stripe):', err));
  if (userId) await deleteUser(userId).catch((err) => console.error('cleanup (user):', err));
});

async function openBilling(page: Page) {
  await page.getByText('Account & Billing', { exact: true }).click();
  await page.getByRole('button', { name: 'Billing & Plans' }).click();
}

test('a new customer signs in, creates the organization, starts on the Developer trial, buys Developer and gets the Pro trial', async ({ page }) => {
  // The login page only offers providers that are enabled for this environment.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByPlaceholder('name@company.com').fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // No organization yet: onboarding, never an empty dashboard.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByPlaceholder('e.g. Acme Global Logistics').fill(user.org);
  await page.getByRole('button', { name: /Continue to BYOK Keys/ }).click();
  await page.getByRole('button', { name: /Continue to Telephony/ }).click();
  await page.getByRole('button', { name: /Complete Setup/ }).click();

  // Opening the new organization lands on the dashboard and stays there.
  await expect(page).toHaveURL(/\/organizations/);
  await page.getByText(user.org).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Could not load context profiles')).toHaveCount(0);

  // Billing: Free with the 7-day Developer trial, and Subscribe offered during the trial.
  await openBilling(page);
  await expect(page.getByText(/Trial · 7 days left/)).toBeVisible();
  await expect(page.getByText(/Trying Developer until/)).toBeVisible();

  // Stripe Checkout (test mode) with the test card.
  await page.getByRole('button', { name: 'Subscribe' }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await expect(page.getByText('Context Control Developer').first()).toBeVisible();
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('E2E Test');
  // Checkout guesses the country from the runner's IP (US asks for a ZIP); our customers are in
  // Mexico. Link's "save my information" would also ask for a phone: leave it off.
  await page.locator('#billingCountry').selectOption('MX');
  const zip = page.locator('#billingPostalCode');
  if (await zip.isVisible().catch(() => false)) await zip.fill('06600');
  const link = page.locator('#enableStripePass');
  if (await link.isVisible().catch(() => false)) await link.uncheck();
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  // Back in the app: confirmed by the webhook, base Developer + 7 days of Pro.
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
  await expect(page.getByText(/Payment confirmed: you're on Developer and 7 days of Pro/)).toBeVisible({ timeout: 45_000 });

  const usage = await (await page.request.get('/api/v1/account/usage')).json();
  expect(usage).toMatchObject({ base_plan: 'developer', billing_status: 'active', plan: 'pro', trial: { tier: 'pro' } });

  // Deleting the organization works for the owner (cleanup through the product itself) and
  // cancels the subscription in Stripe first.
  const del = await page.request.post('/api/v1/account/delete', { data: { confirm: user.org } });
  expect(del.ok()).toBeTruthy();

  // Without an organization the dashboard sends back to onboarding.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
});

test('sign out ends the session', async ({ page }) => {
  const other = newTestUser();
  const id = await createUser(other.email, other.password);
  try {
    await page.goto('/login');
    await page.getByPlaceholder('name@company.com').fill(other.email);
    await page.locator('input[type="password"]').first().fill(other.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByPlaceholder('e.g. Acme Global Logistics').fill(other.org);
    await page.getByRole('button', { name: /Continue to BYOK Keys/ }).click();
    await page.getByRole('button', { name: /Continue to Telephony/ }).click();
    await page.getByRole('button', { name: /Complete Setup/ }).click();
    await expect(page).toHaveURL(/\/organizations/);
    await page.getByText(other.org).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // Remove the organization now (the session is needed); the page stays open.
    expect((await page.request.post('/api/v1/account/delete', { data: { confirm: other.org } })).ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/api/v1/account/usage')).status()).toBe(401);
  } finally {
    await deleteUser(id).catch((err) => console.error('cleanup (user):', err));
  }
});
