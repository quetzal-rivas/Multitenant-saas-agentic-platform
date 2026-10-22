# Legacy code (kept for reference, not built or deployed)

Code that no longer runs as part of Context Control, moved here instead of deleted so you can
decide what to keep. Nothing in this folder is type-checked, linted, tested, bundled or deployed
(`tsconfig.json` and `eslint.config.mjs` exclude it). Export or delete it when you are done.

| Path | What it was | Why it was retired | Replaced by |
|---|---|---|---|
| `Backend/deferred-task-engine/` | BullMQ + Redis + LangGraph "deferred task engine" (Node) | Never deployed; scheduled tasks were stored but nothing ran them | Scheduled tasks run as agent runs on `cc-agent-worker` (`lib/services/scheduled-tasks.ts`, `lib/services/agent-runs.ts`) |
| `Backend/README.md` | Description of an in-memory "Platform Control MCP Server" (STDIO, "<5 ms controllers") | Described mock controllers, not the real server | `/api/mcp/platform` (`lib/mcp/platform-mcp-server.ts`) |
| `Backend/schema.sql` | Early "hub-and-spoke / LangGraph PostgresSaver" schema | Superseded | `supabase/migrations/` |
| `app-routes/schedule_task/route.ts` | Public `/schedule_task` endpoint (no auth) into the in-memory deferred task engine | Unauthenticated and backed by the never-deployed engine | `POST /api/v1/schedule_task` and `POST /api/v1/tasks` (session / API key, tenant from credentials) |
| `sam-python-backend/` (`Dockerfile`, `template.yaml`, `samconfig.toml`, `requirements.txt`, `deploy-job.yml`) | AWS SAM stack for a Python FastAPI Lambda (`Backend.main.handler`) | `Backend/main.py` never existed, so the deploy job always skipped | Next.js API routes on Amplify + the `cc-agent-worker` / `cc-function-deployer` Lambdas |
| `app-routes/conversations/` (`route.ts`, `[threadId]/route.ts`) | `/api/v1/conversations` over an in-memory mock store (no auth, `force-static`) | Fake data | `/api/v1/conversations` and `/api/v1/conversations/[id]` over real agent instances and runs (`lib/services/conversations.ts`) |
| `lib/demo/conversations-manager.ts` | Mock conversation store (fake team transcripts, fake ElevenLabs call metadata) | Fake data | Same as above |
| `components/LiveVoiceConferenceSection.tsx`, `lib/demo/twilio-conference-manager.ts`, `app-routes/twilio/live-calls/route.ts` | "Live voice conference" monitor: fake Twilio calls and a synthesized hum | Mock; phone calls are not built yet | Browser voice turns (Voice page, Agent Studio mic). Phone calls are a later phase |
| `lib/voice/voice-service.ts`, `tests/phase5-voice.test.ts` | Twilio webhook signature check, TCPA attestation helpers, `ENABLE_VOICE_CALLS` flag | Only used by the mock route; kept for the future phone phase | `lib/voice/engine.ts` (speech-to-text / text-to-speech with fallback) |
| `components/EndpointsView.tsx` | "Endpoints" page: a hard-coded catalog of fake services (BullMQ scheduler, LangGraph engine, post-call CRM sync…) | Mock data | Webhooks page (`components/InboundGatewayView.tsx`): real inbound endpoints with signature checks and routing |
| `snippets/onboarding-step3-mock-twilio-numbers.tsx.txt` | Onboarding step 3: fake 555 Twilio numbers and a "port custom number" form the server ignored | Mock | Optional "Connect your Twilio account" step (real verification) and Live Calls → Twilio & numbers |
| `snippets/docs-endpoints-and-platform-mcp-mock.tsx.txt` | `/docs` sections for the mock Endpoints page and the mock "Platform MCP Controller" (fake tools, `x-tenant-id` header) | Described tools that never existed; misled an external agent | `components/docs/McpToolsReference.tsx` (generated from the live tool catalog) |
| `snippets/api-keys-client-token-minter.tsx.txt` | API Keys page "Mint Scoped Context Token" section with a TTL slider and fake tool chips | No API accepts client tokens yet; the tools listed did not exist | Nothing yet (backend `POST /api/v1/context/token` and `lib/auth/jwks.ts` kept for a future browser widget) |
| `snippets/profiles-mock-latency-stats.tsx.txt` | Profiles page stat cards "Avg Compilation Latency 14.2 ms" and "Target Architecture" | Hard-coded numbers, no metric behind them | Nothing (the real counts stay) |
| `components/LogsView.tsx` | "Logs & Tracing" page over fixed demo logs (`INITIAL_LOGS`) and an unused `ephemeral_context` table | Fake data | `components/ActivityLogView.tsx` + `GET /api/v1/activity`: real agent runs (step timeline from `run_events`), webhook deliveries and function calls |
| `components/SimulatorView.tsx` | "Test Simulator" sandbox: a fake LangGraph / Redis / "Port 3000 Mock Egress" pipeline | Mock; nothing it showed ran | Agent Studio (real runs) and Logs & Tracing |
| `components/SettingsView.tsx` | "Compiler Policies" page (token budget, cache TTL, output format) | Save did nothing; no setting was read anywhere | Nothing yet (run limits live in `organizations.agent_limits`) |
| `components/SourcesView.tsx` | "Sources" page with config / test-ping dialogs | UI only: no API stored or tested sources | Context profiles' own source steps (Profile builder) |
| `lib/compiler-sample-data.ts` | Context compiler that filled memory, RAG, conversation, live-data, tenant and user steps with invented sample data (a timeshare customer "Sarah", contract CTR-9281…) | Returned fake context to real callers through `/api/v1/context/resolve`, which also served demo profiles without auth | `lib/compiler.ts` (only profile text, the organization, and caller input; unconnected sources reported as `not_connected`) and an authenticated, database-backed resolve route |
| `app-routes/docs/page.tsx`, `components/docs/McpToolsReference.tsx` | The public `/docs` page (feature guides, screenshots, generated MCP tool reference) | Out of date: most features it described have changed; the owner retired it on 2026-10-22 | Nothing yet (the MCP tool list is still served live by `tools/list` on `/api/mcp/platform`) |

## AWS resources from the old backend (not touched)
Moving these files does not delete anything in AWS. Earlier experiments left resources such as a
`context-control-backend-FastAPILambdaFunction-…` Lambda (CloudFormation stack
`context-control-backend` / `multitenant-agent-backend`). Review and delete them in the AWS console
when you are sure they are unused.
