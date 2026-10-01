---
name: mock-to-engine
description: Audit a project for mocked, hardcoded, or simulated behavior and replace it with a real, production-grade implementation one vertical slice at a time. Use when the user says a project is a prototype or fake, asks to make it real, wire it to real services, replace mocks, or invokes /mock-to-engine.
---

# Mock to Engine

Take a project whose interface works but whose logic is faked (hardcoded data, keyword matching, simulated delays, stub tools) and turn it into a working system, without breaking the UI and without pretending something is real when it is not.

The goal is **honest progress**: at the end, the user knows exactly what is real, what is still mocked, and how to run and test it.

## Principles

- **Audit before building.** Never start replacing code until the mock inventory is written and the user has seen it.
- **One vertical slice at a time.** Replace one end-to-end capability (UI to backend to external service and back) fully before starting the next. Do not half-build everything.
- **Keep the contract, change the implementation.** The frontend and the rest of the app should keep working while the internals change. Define the interface first, then put the real implementation behind it.
- **Never fake success.** If a real call fails, surface the error. Do not silently fall back to mock data in the normal path.
- **Report honestly.** Do not call the project "production-ready" or "state of the art." Say what was done and what remains.

## Steps

### 1. Audit and write the mock inventory

Search the whole repo (frontend and backend) for signs of fake behavior:

- Words and markers: `mock`, `fake`, `stub`, `dummy`, `sample`, `placeholder`, `TODO`, `FIXME`, `hardcoded`, `lorem`.
- Hardcoded data standing in for a database or API: large literal dicts, arrays, or JSON fixtures returned by handlers.
- Keyword or regex routing that pretends to be AI or decision logic (`if "invoice" in message`).
- Simulated latency or progress: `setTimeout`, `sleep`, fake loading states, random numbers used as metrics.
- Tools, integrations, or payments that return canned responses instead of calling the real service.
- Auth that always succeeds, permissions that are never checked, and storage that resets on reload.
- Environment variables that are unused or point nowhere.

Write the result as `MOCK_INVENTORY.md` in the project root: a table with columns **Location** (file and lines), **What is faked**, **What real behavior it should have**, **Needs** (API key, service, schema, decision), and **Priority**. Show it to the user and summarize it in a few sentences.

### 2. Confirm decisions with the user

Before building, ask only about choices that change the work and cannot be inferred:

- Which LLM provider and model, if the project needs one.
- Which external services are in scope first, and whether sandbox or test credentials exist.
- Where it will run (local, a single server, cloud) and which database to use.
- Which slice should come first. Recommend the one that unlocks the most value with the least risk.

If the user is not available, choose the most reasonable defaults, state them clearly, and continue.

### 3. Define contracts

For the chosen slice, write down the shared interface before any implementation: request and response schemas, error shapes, and the tool or function signatures. Use typed models (for example Pydantic, Zod, or TypeScript types). Update the frontend only if the contract genuinely must change.

### 4. Build the real implementation

Use what fits the project. Typical replacements:

| Mock | Real replacement |
|---|---|
| Keyword routing pretending to be AI | Real LLM calls with a system prompt, tool schemas, and a structured agent loop (for example LangGraph) |
| Hardcoded tool catalog | A real tool layer; for MCP, an MCP client that connects to servers, lists their tools dynamically, and executes calls |
| Canned responses | Calls to the actual service or API, with retries and timeouts |
| In-memory or literal data | A real database with migrations, and queries behind a repository layer |
| Fake auth | Real authentication and per-user authorization checks |
| Fake progress or metrics | Real events streamed from the backend (SSE or WebSockets) and real counters |

Always include in the real path:

- **Configuration:** all keys and URLs from environment variables, plus a committed `.env.example` listing every variable (no real values). Never hardcode or log secrets.
- **Errors and limits:** timeouts, bounded retries with backoff, clear error messages, and a maximum number of agent steps or tool calls per request.
- **Safety for tool execution:** an allowlist of tools, validation of every tool argument against its schema, and explicit user confirmation before anything with side effects (payments, deletions, emails, writes to external systems). Use test or sandbox credentials while developing.
- **Observability:** structured logs for each LLM call and tool call (inputs trimmed, secrets removed), with latency and outcome, so behavior can be debugged.
- **Cost control:** cap tokens and iterations, and log usage.

### 5. Keep an explicit mock mode (optional but recommended)

If the mocks are useful for tests and demos, keep them behind a clear flag (for example `USE_MOCKS=true`), off by default, and never reachable by accident in the real path. Label any data returned from mocks as simulated.

### 6. Test and verify

- Add automated tests for the slice: unit tests for logic, and an integration test that exercises the real path against a sandbox or a local test server.
- Run the tests and the app. Exercise the slice through the actual UI or API, not just the unit tests.
- Test failure cases: bad credentials, timeouts, malformed tool output, and the model asking for a tool that does not exist.
- Do not mark the slice done until it passes. If something cannot be verified (no credentials, no network), say so.

### 7. Update the inventory and report

Update `MOCK_INVENTORY.md`: mark replaced items as done and keep remaining ones listed. Then report:

- What is now real, with how to run and test it.
- What is still mocked or unverified.
- What the user must provide (keys, services, decisions).
- The recommended next slice.

Repeat steps 3 to 7 for the next slice only after the user agrees.

## Definition of "real"

A capability counts as real only if all of these are true:

1. It calls the actual service, model, or database, not a literal.
2. Its behavior changes with the real input and the real state, not with keyword checks.
3. Failures are reported, not hidden.
4. Credentials come from configuration, not code.
5. A test exercises it end to end.

## Rules

- Never run real payments, deletions, or messages to real people during development. Use sandbox accounts, and ask before any irreversible action.
- Do not rewrite the whole project at once or change the visual design unless asked.
- Do not claim a result you have not run. Report what you verified and what you did not.
- Do not leave dead mock code behind without recording it in the inventory.