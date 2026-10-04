/**
 * Run the Platform MCP evaluation (mcp-builder format) against a live endpoint.
 *
 *   CC_MCP_EVAL_KEY=ctx_live_... ANTHROPIC_API_KEY=... \
 *     npx tsx scripts/mcp-eval/run.ts --url http://localhost:3000/api/mcp/platform
 *
 * Options: --url (required), --file (default evals/platform-mcp/questions.xml),
 *          --model (default claude-opus-5-5), --only 1,4 (question numbers).
 *
 * Unlike the skill's evaluation.py, every tool_use block of a turn is executed and
 * all results go back in one user message (current models call tools in parallel).
 * Each run spends Anthropic tokens on your key; it never runs in CI.
 */
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MAX_TURNS = 20;
const SYSTEM_PROMPT = [
  'You answer questions about a Context Control organization using only the provided tools.',
  'Gather everything you need with the tools, then give your final answer inside <response></response> tags,',
  'exactly in the format the question asks for, with nothing else inside the tags.',
].join(' ');

interface QaPair {
  question: string;
  answer: string;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function decodeXml(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function parseQaPairs(xml: string): QaPair[] {
  const pairs: QaPair[] = [];
  const re = /<qa_pair>\s*<question>([\s\S]*?)<\/question>\s*<answer>([\s\S]*?)<\/answer>\s*<\/qa_pair>/g;
  for (const m of xml.matchAll(re)) pairs.push({ question: decodeXml(m[1].trim()), answer: decodeXml(m[2].trim()) });
  return pairs;
}

export function normalize(answer: string): string {
  return answer.replace(/^[\s"'`]+|[\s"'`.]+$/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function extractResponse(text: string): string | null {
  const m = text.match(/<response>([\s\S]*?)<\/response>/);
  return m ? m[1].trim() : null;
}

async function main() {
  const url = arg('url');
  const key = process.env.CC_MCP_EVAL_KEY;
  if (!url || !key || !process.env.ANTHROPIC_API_KEY) {
    console.error('Usage: CC_MCP_EVAL_KEY=... ANTHROPIC_API_KEY=... npx tsx scripts/mcp-eval/run.ts --url <mcp endpoint>');
    process.exit(2);
  }
  const file = arg('file', path.join('evals', 'platform-mcp', 'questions.xml'))!;
  const model = arg('model', 'claude-opus-5-5')!;
  const only = arg('only')?.split(',').map(Number);

  const mcp = new Client({ name: 'context-control-eval', version: '1.0.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  const { tools: mcpTools } = await mcp.listTools();
  const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description || '',
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
  console.log(`Connected to ${url}: ${tools.length} tools (${tools.map((t) => t.name).join(', ')})\n`);

  const anthropic = new Anthropic();
  const pairs = parseQaPairs(fs.readFileSync(file, 'utf8'));
  const results: Array<{ n: number; ok: boolean; expected: string; got: string | null; toolCalls: number; seconds: number; note?: string }> = [];

  for (const [index, pair] of pairs.entries()) {
    const n = index + 1;
    if (only && !only.includes(n)) continue;
    const started = Date.now();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pair.question }];
    let toolCalls = 0;
    let finalText = '';
    let note: string | undefined;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        output_config: { effort: 'medium' },
      });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'refusal') {
        note = 'model refused';
        break;
      }
      if (response.stop_reason === 'max_tokens') {
        note = 'hit max_tokens';
        break;
      }
      if (response.stop_reason === 'pause_turn') continue;

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (toolUses.length === 0) break;

      // Run every requested tool call and return all results in a single message.
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (use) => {
          toolCalls++;
          try {
            const result = await mcp.callTool({ name: use.name, arguments: use.input as Record<string, unknown> });
            const text = (result.content as Array<{ type: string; text?: string }>)
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
            return { type: 'tool_result' as const, tool_use_id: use.id, content: text || JSON.stringify(result.structuredContent ?? {}), ...(result.isError ? { is_error: true } : {}) };
          } catch (err) {
            return { type: 'tool_result' as const, tool_use_id: use.id, content: `Error: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
          }
        })
      );
      messages.push({ role: 'user', content: toolResults });
      if (turn === MAX_TURNS - 1) note = `stopped after ${MAX_TURNS} turns`;
    }

    const got = extractResponse(finalText);
    const ok = got !== null && normalize(got) === normalize(pair.answer);
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    results.push({ n, ok, expected: pair.answer, got, toolCalls, seconds, note });
    console.log(`${ok ? 'PASS' : 'FAIL'} #${n} (${toolCalls} tool calls, ${seconds}s) expected="${pair.answer}" got="${got ?? '(no <response>)'}"${note ? ` [${note}]` : ''}`);
  }

  await mcp.close();
  const passed = results.filter((r) => r.ok).length;
  const avgCalls = results.length ? (results.reduce((s, r) => s + r.toolCalls, 0) / results.length).toFixed(1) : '0';
  console.log(`\nAccuracy: ${passed}/${results.length} (${results.length ? Math.round((passed / results.length) * 100) : 0}%) · avg ${avgCalls} tool calls per question`);
  process.exit(passed === results.length ? 0 : 1);
}

// Run only when executed directly (the parser is unit-tested).
if (process.argv[1] && process.argv[1].endsWith(path.join('mcp-eval', 'run.ts'))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
