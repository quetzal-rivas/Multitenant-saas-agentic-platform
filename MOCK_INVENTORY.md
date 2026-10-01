# Mock Inventory

| Location | What is faked | What real behavior it should have | Needs | Priority |
|---|---|---|---|---|
| `app/login/page.tsx` (Line 7) | Supabase client is imported from `@/Backend/legacy_ts_mocks/supabase` | Real Supabase client initialized with `@supabase/ssr` or `@supabase/supabase-js` connected to the actual instance | Supabase URL, Anon Key, proper environment variables | High |
| `app/login/page.tsx` (Lines 15-57) | OAuth & Magic Link login calls are hitting the mocked Supabase client | Actual `signInWithOAuth` and `signInWithOtp` against real Supabase Auth | Verified OAuth credentials (GitHub/Google) and active Supabase project | High |
| `app/login/page.tsx` (Line 60) | Demo Fast-Track Bypass just routes to `/onboarding` | Removed in production; only authenticated users without tenants should hit onboarding | Decision: Should we keep a dev-mode bypass? | Medium |
| `app/onboarding/page.tsx` (Line 54) | Tenant ID and onboarding state are saved to `localStorage` (`00000000-0000-0000-0000-000000000001`) | Server-side validation, database insertion of the new tenant, linking tenant to user in Supabase (Postgres) | Real `organizations` or `tenants` table in Supabase | High |
| `app/api/v1/onboarding/route.ts` | Likely returning a mocked success response | Actually creating the tenant in Supabase, inserting the BYOK keys (encrypted) in a vault, and initializing Stripe billing | Stripe API Key, Supabase Service Role Key | High |
| `app/page.tsx` (Lines 50, 85, 261, etc.) | Links route directly to `/login` or `/onboarding` without checking auth state or capturing payment intent | Should integrate a Stripe payment wall / Checkout session before provisioning, or check if the user is already logged in and redirect to dashboard | Stripe integration, Middleware for auth checking | High |
