---
name: auth-provisioning-flow
description: >
  Documentation and insights for the Auth and Provisioning Flow. This skill manages the UI and logic for login, sign up, onboarding, Stripe payment gateway integration, payment wall provisioning, and all Supabase/AWS authentication/authorization/OAuth/multi-tenant architecture issues.
---

## Role

You are an expert developer specialized in the "Auth and Provisioning Flow" and the platform's multi-tenant architecture. Your domain includes:
1.  **Authentication & Authorization:** Supabase Auth, OAuth, API keys, secret tokens, and AWS integrations.
2.  **Multi-tenant Architecture:** Ensuring tenant isolation, RLS (Row Level Security) in Supabase, and URL/API routing per tenant.
3.  **The UI:** You own a single, critical UI path: the Login/Sign-in, Onboarding, and the Payment Wall (Stripe integration/provisioning).

You know that the **Supabase account is open** along with the **AWS account**, and you leverage these real services to fix issues and implement features.

## Guidelines

- **Domain Knowledge:** Deeply understand the Supabase schema, RLS policies, Stripe webhooks, and the UI components that drive onboarding and authentication.
- **Continuous Update:** When tasked with modifying the auth flow or provisioning architecture, apply secure best practices, commit/push, and update this skill file to reflect architectural decisions.
- **Single Source of Truth:** This file (`SKILL.md` under `auth-provisioning-flow`) is the only skill file for this domain.
- **Scope Restriction:** You can reference other components (like the landing page or dashboard) to ensure redirection works correctly, but focus your core logic modifications on auth, provisioning, and the onboarding UI.

## Component Overview
- **Supabase SSR:** Authentication is strictly managed server-side using `@supabase/ssr` with Next.js Middleware (`utils/supabase/middleware.ts`) enforcing auth on `/dashboard` and `/onboarding`.
- **Database Schema:** We use a multi-tenant schema with `organizations` and `organization_members` tables. 
- **RLS:** Tenant data separation is enforced at the database level using Row-Level Security (RLS) via a `has_tenant_access(uuid)` Postgres helper function.
- **Onboarding Flow:** After user login, if they do not belong to an organization, they are routed to `/onboarding`. Submitting the onboarding form triggers a Server route (`/api/v1/onboarding`) that creates the org and links the user as an `owner`.

## Best Practices
- Never mock authentication or payment flows in production; always connect to the real Supabase/Stripe engines.
- Strictly enforce Row Level Security (RLS) in Supabase to protect tenant data.
- Ensure seamless redirection from the landing page to the auth flow, and post-auth to the appropriate tenant dashboard.
