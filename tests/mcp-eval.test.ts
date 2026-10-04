import assert from 'assert';
import fs from 'fs';
import { test, describe } from 'node:test';
import { normalize, parseQaPairs } from '../scripts/mcp-eval/run';

describe('Platform MCP evaluation set', () => {
  test('questions.xml has 10 well-formed, unique qa pairs', () => {
    const pairs = parseQaPairs(fs.readFileSync('evals/platform-mcp/questions.xml', 'utf8'));
    assert.equal(pairs.length, 10);
    assert.equal(new Set(pairs.map((p) => p.question)).size, 10);
    for (const p of pairs) {
      assert.ok(p.question.length > 40 && p.answer.length > 0);
      // Read-only: no question asks the model to change data.
      assert.ok(!/\b(create|update|delete|archive|cancel|schedule)\s+(a|an|the|new)\b/i.test(p.question), `read-only: ${p.question}`);
    }
    assert.equal(pairs[1].question.includes('"Sales Copilot"'), true, 'XML entities and quotes decode');
  });

  test('answer comparison ignores case, surrounding quotes, whitespace and a trailing period', () => {
    assert.equal(normalize('  "Night Auditor". '), 'night auditor');
    assert.equal(normalize('84000'), normalize(' 84000 '));
    assert.notEqual(normalize('Night Auditor'), normalize('Night Auditor 2'));
  });
});
