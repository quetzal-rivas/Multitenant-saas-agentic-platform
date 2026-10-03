# Context Control - Architectural Decisions (DECISIONS.md)

## Decision 001: Unified Agent Runtime (TypeScript / LangGraph.js)
- **Date**: 2026-10-03
- **Status**: Accepted
- **Context**: The repository contained a legacy simulated Python worker (`Backend/langgraph_worker.py`, `Backend/main.py`) alongside TypeScript simulated code (`Backend/legacy_ts_mocks/`). Phase 0 requires choosing a single production agent runtime.
- **Decision**: Select **TypeScript (LangGraph.js)** as the single runtime for agent loops, workers, and MCP gateways.
- **Rationale**:
  1. Shared types, Zod schemas, contract specifications, and error schemas across Next.js frontend, route handlers, and Lambda worker functions.
  2. Single dependency tree using official TS SDKs (`@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `@modelcontextprotocol/sdk`, `@aws-sdk/client-sqs`, `@aws-sdk/client-kms`).
  3. Lower cold-start overhead on AWS Lambda Node.js runtime compared to Python environments with full LLM dependencies.
- **Consequences**: Remove the Python backend files (`Backend/main.py`, `Backend/langgraph_worker.py`, etc.). Restructure TS worker modules into clean production files under `lib/agent/`, `lib/mcp/`, and `workers/`.

## Decision 002: Model Context Protocol (MCP) Standards Compliance
- **Date**: 2026-10-03
- **Status**: Accepted
- **Context**: MCP protocol standards require modern transport and schema compliance.
- **Decision**: Use **Streamable HTTP** transport over standard HTTP POST endpoints (deprecating standard HTTP+SSE streams as per modelcontextprotocol.io spec).
- **Libraries**: `@modelcontextprotocol/sdk` (latest).
- **Security**: Custom MCP servers registered by tenants must be HTTPS URLs only. SSRF validation must block private (RFC 1918), link-local (164.254.0.0/16), loopback (127.0.0.0/8), and AWS metadata IP ranges (169.254.169.254).

## Decision 003: Demo Mode & Mock Isolation Strategy
- **Date**: 2026-10-03
- **Status**: Accepted
- **Context**: Previously, mock data was directly imported into production data services and UI views.
- **Decision**:
  1. Rename `USE_MOCKS` to `DEMO_MODE`.
  2. Isolate mock fixtures into a dedicated `lib/demo/` directory.
  3. Enforce ESLint `no-restricted-imports` so code outside `lib/demo/` or `app/demo/` cannot import mock files when building for production.
  4. Display a visible "Demo Data / Playground Mode" banner when `DEMO_MODE=true`.

## Decision 004: EventBridge Scheduler & SQS for Deferred Tasks
- **Date**: 2026-10-03
- **Status**: Accepted
- **Context**: Replace BullMQ, Redis, in-memory `setTimeout`, and Python `scheduler.py`.
- **Decision**: Use AWS EventBridge Scheduler `at()` schedules targeting AWS SQS standard queues, coupled with worker Lambdas.
- **Outbox Pattern**: Schedule records are inserted into Supabase Postgres prior to creating EventBridge schedules. Failing schedules are reconciled via async sweepers.
