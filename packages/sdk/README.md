# Context Control TypeScript SDK

A dependency-light TypeScript client for the Context Control Streamable HTTP MCP endpoint. It performs the MCP initialize handshake, discovers whitelisted tools, and makes authenticated tool calls.

## Install

```bash
npm install @contextcontrol/sdk
```

## Use

```ts
import { ContextControl } from '@contextcontrol/sdk';

const client = new ContextControl({
  apiKey: process.env.CONTEXT_CONTROL_API_KEY!,
  baseUrl: process.env.CONTEXT_CONTROL_BASE_URL!,
});

const profiles = await client.profiles.list();
console.log(profiles.map((profile) => profile.name));

const task = await client.tasks.schedule({
  title: 'Quarterly account review',
  instructions: 'Review the account and prepare a summary.',
  targetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});
console.log(task.id, task.status, task.target_time);
```

`baseUrl` is the application origin (for example, `https://your-domain.example`) or the full `/api/mcp/platform` endpoint. The SDK appends the endpoint path when needed and sends the key only in the `Authorization` header.

API keys must explicitly allow the requested MCP tool and its scope. The current platform tools are `contextcontrol_list_profiles` (`mcp:profiles:read`), `contextcontrol_list_tasks` (`mcp:tasks:read`), and `contextcontrol_schedule_task` (`mcp:tasks:write`). Empty tool whitelists deny all tools. Task scheduling creates a tenant-owned `supervisor_tasks` record; downstream execution depends on the platform scheduler being configured.

The lower-level `client.mcp` interface also exposes `initialize()`, `listTools()`, `callTool()`, and `ping()` for direct MCP use.

## Build and test from this repository

```bash
npm run build --prefix packages/sdk
npm test --prefix packages/sdk
```
