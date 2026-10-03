# Context Control - Upgrade Plan & Audit Tracking

This document tracks the status of the 17 production upgrade items for **Context Control**.

| Item | Description | Status | Target Phase | Verification |
|---|---|---|---|---|
| 1 | Identity & Auth: Verified credential enforcement, remove default tenant IDs | Completed | Phase 1 | Automated auth & isolation tests |
| 2 | Client Tokens: Asymmetric ES256 minter & JWKS verification endpoint | Completed | Phase 2 | JWT validation tests |
| 3 | OAuth Spokes: OAuth + PKCE for Google & Slack with token rotation | Completed | Phase 2 | PKCE & state verification tests |
| 4 | Envelope Encryption: KMS AES-256-GCM envelope encryption for secrets | Completed | Phase 2 | KMS lock down & test suite |
| 5 | Platform API Keys & Disabled Sandbox: Hashed `mcp_api_keys`, disable execution endpoint | Completed | Phase 2 | SHA-256 lookup & 403 checks |
| 6 | Provider Adapters: Real Anthropic, OpenAI, Gemini adapters with token counting | Completed | Phase 3 | Multi-provider integration tests |
| 7 | Agent Loop: LangGraph TS supervisor loop with Postgres checkpointer | Completed | Phase 3 | State persistence & worker restart tests |
| 8 | MCP Gateway: Official SDK Streamable HTTP gateway & Platform MCP Lambda | Completed | Phase 3 | Gateway & Platform MCP tests |
| 9 | Durable Tasks: EventBridge Scheduler + SQS + worker Lambdas (Remove BullMQ/Redis) | Completed | Phase 4 | Scheduled task outbox & execution tests |
| 10 | Context Compiler & Realtime: Real token counts, prompt caching, `run_events` Realtime | Completed | Phase 3 | Realtime event subscription tests |
| 11 | RAG Ingestion & Vector Search: pgvector `memory_store` under RLS | Completed | Phase 4 | RAG pipeline tests |
| 12 | Voice Integration: ElevenLabs + Twilio behind feature flag & compliance attestation | Completed | Phase 5 | Post-call webhook & flag checks |
| 13 | Stripe Billing & Entitlements: Webhook deduping, plan entitlement enforcement | Completed | Phase 4 | Stripe lifecycle tests |
| 14 | Multi-Tenant RLS & Isolation: Role-aware RLS (`(select auth.uid())`), zero leak | Completed | Phase 1 | Supabase RLS matrix tests |
| 15 | CI/CD & IaC: GitHub OIDC deployment, AWS SAM free-tier compliance | Completed | Phase 0 | GitHub Actions workflow & SAM validate |
| 16 | API Security & CORS: Deny-by-default `/api/*`, origin allowlist, signature validation | Completed | Phase 1/2 | Middleware & route security tests |
| 17 | Hardening & Observability: OpenAPI 3.1, RFC 9457 errors, rate limiting, OpenTelemetry | Completed | Phase 6 | Schema validation & observability tests |
