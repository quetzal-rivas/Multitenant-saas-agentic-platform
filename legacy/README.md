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

## AWS resources from the old backend (not touched)
Moving these files does not delete anything in AWS. Earlier experiments left resources such as a
`context-control-backend-FastAPILambdaFunction-…` Lambda (CloudFormation stack
`context-control-backend` / `multitenant-agent-backend`). Review and delete them in the AWS console
when you are sure they are unused.
