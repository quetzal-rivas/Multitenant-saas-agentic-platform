# Platform MCP evaluation

Ten read-only questions (mcp-builder format) that check whether a model can answer
real questions about an organization using only the Platform MCP tools.

1. Seed the fixed eval organization (needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

   ```bash
   npm run eval:mcp:seed
   ```

   It prints a read-only API key for the eval org. Re-running rebuilds the org from scratch.

2. Run the evaluation against a running server (spends tokens on your Anthropic key):

   ```bash
   CC_MCP_EVAL_KEY=ctx_live_... ANTHROPIC_API_KEY=... npm run eval:mcp -- --url http://localhost:3000/api/mcp/platform
   ```

   Options: `--model` (default `claude-opus-5-5`), `--only 1,4`, `--file`.

If you change `seed.ts`, re-verify every answer in `questions.xml`.
