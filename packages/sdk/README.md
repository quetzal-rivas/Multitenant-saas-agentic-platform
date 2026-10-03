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

const server = await client.mcp.initialize();
const tools = await client.mcp.listTools();
console.log(server.name, tools.map((tool) => tool.name));

const result = await client.mcp.callTool('tool_name', { example: true });
console.log(result.content);
```

`baseUrl` is the application origin (for example, `https://your-domain.example`) or the full `/api/mcp/platform` endpoint. The SDK appends the endpoint path when needed and sends the key only in the `Authorization` header.

The server denies calls for tools not explicitly present in the API key's whitelist. Tool execution requires a configured remote MCP endpoint; it returns an MCP error instead of fabricating success when no endpoint is configured.

## Build and test from this repository

```bash
npm run build --prefix packages/sdk
npm test --prefix packages/sdk
```
