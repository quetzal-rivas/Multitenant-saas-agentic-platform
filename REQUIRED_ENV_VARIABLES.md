# Required Production Environment Variables

As we refactor the components from mock to production, we will accumulate all the required environment variables here. Once the refactoring is complete, this list can be used to populate the AWS Amplify environment variables.

## Stripe Integration (Paywall & Webhooks)
- `STRIPE_SECRET_KEY`: Used to securely interact with the Stripe API from the backend (e.g., verifying sessions or creating customers).
- `STRIPE_WEBHOOK_SECRET`: Used in the webhook endpoint (`/api/webhooks/stripe`) to verify that the incoming checkout completion events are genuinely from Stripe.

## Supabase Integration (Database & Auth)
- `NEXT_PUBLIC_SUPABASE_URL`: The public URL of the Supabase project, used by both the client and server to connect.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The public anonymous key for Supabase, safe to expose to the client for unauthenticated or RLS-protected requests.
- `SUPABASE_SERVICE_ROLE_KEY`: The highly privileged admin key. Used by the backend (like the Stripe webhook) to bypass Row Level Security (RLS) and update the database safely. **Never expose this to the client.**

*(More variables will be added here as we continue refactoring other components.)*
