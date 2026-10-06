import crypto from 'crypto';
import { strToU8, zipSync } from 'fflate';
import { transform } from 'sucrase';

/**
 * Packaging for user functions. The user writes `main(input)`; the platform wraps it
 * in a small Lambda handler that captures logs, catches errors, measures duration and
 * caps the output size. The wrapper always returns a FunctionResult-shaped object.
 */

import { FUNCTION_LANGUAGES } from './function-spec';

export type FunctionLanguage = (typeof FUNCTION_LANGUAGES)[number];

export const MAX_OUTPUT_BYTES = 65_536;

export interface FunctionResult {
  status: 'ok' | 'error';
  output: unknown;
  error: string | null;
  logs: string;
  duration_ms: number;
}

export const LANGUAGE_RUNTIME: Record<FunctionLanguage, { runtime: 'python3.12' | 'nodejs22.x'; handler: string }> = {
  python: { runtime: 'python3.12', handler: 'handler.handler' },
  typescript: { runtime: 'nodejs22.x', handler: 'index.handler' },
};

export const CODE_TEMPLATES: Record<FunctionLanguage, string> = {
  python: `def main(input: dict) -> dict:
    """Receives the tool input as a dict and returns a JSON-serializable dict."""
    name = input.get("name", "world")
    return {"greeting": f"Hello, {name}!"}
`,
  typescript: `export default async function main(input: { name?: string }) {
  // Receives the tool input and returns any JSON-serializable value.
  return { greeting: \`Hello, \${input.name ?? 'world'}!\` };
}
`,
};

const PYTHON_HANDLER = `import importlib, io, json, sys, time, traceback

MAX = ${MAX_OUTPUT_BYTES}

def handler(event, context):
    started = time.time()
    captured = io.StringIO()
    real_stdout = sys.stdout
    sys.stdout = captured
    status, output, error = "ok", None, None
    try:
        user = importlib.import_module("user_function")
        if not callable(getattr(user, "main", None)):
            raise RuntimeError("Define a function main(input) in your code.")
        output = user.main((event or {}).get("input") or {})
    except Exception as exc:
        status = "error"
        error = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-4000:]
    finally:
        sys.stdout = real_stdout
    result = {
        "status": status,
        "output": output,
        "error": error,
        "logs": captured.getvalue()[-4000:],
        "duration_ms": int((time.time() - started) * 1000),
    }
    try:
        size = len(json.dumps(result, default=str))
    except Exception as exc:
        result.update(status="error", output=None, error="Output is not JSON-serializable: %s" % exc)
        return result
    if size > MAX:
        result.update(status="error", output=None, error="Output is larger than 64 KB.")
    return json.loads(json.dumps(result, default=str))
`;

const NODE_HANDLER = `const MAX = ${MAX_OUTPUT_BYTES};

export const handler = async (event) => {
  const started = Date.now();
  const logs = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(original)) {
    console[level] = (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  }
  let status = 'ok';
  let output = null;
  let error = null;
  try {
    const mod = await import('./user_function.mjs');
    const main = mod.default ?? mod.main;
    if (typeof main !== 'function') throw new Error('Export a default function main(input) from your code.');
    output = await main((event && event.input) || {});
  } catch (err) {
    status = 'error';
    error = String((err && err.stack) || err).slice(-4000);
  } finally {
    Object.assign(console, original);
  }
  const result = { status, output: output === undefined ? null : output, error, logs: logs.join('\\n').slice(-4000), duration_ms: Date.now() - started };
  let size;
  try {
    size = JSON.stringify(result).length;
  } catch (err) {
    return { ...result, status: 'error', output: null, error: 'Output is not JSON-serializable: ' + err.message };
  }
  return size > MAX ? { ...result, status: 'error', output: null, error: 'Output is larger than 64 KB.' } : result;
};
`;

/** Strip TypeScript types, keeping ES modules. Throws a readable error on syntax errors. */
export function compileTypeScript(code: string): string {
  try {
    return transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
  } catch (err) {
    throw new Error(`TypeScript could not be compiled: ${(err as Error).message}`);
  }
}

export interface FunctionPackage {
  zip: Uint8Array;
  runtime: 'python3.12' | 'nodejs22.x';
  handler: string;
  /** Files in the zip, for tests and diagnostics. */
  files: Record<string, string>;
}

export function buildPackage(language: FunctionLanguage, code: string): FunctionPackage {
  const files: Record<string, string> =
    language === 'python'
      ? { 'handler.py': PYTHON_HANDLER, 'user_function.py': code }
      : { 'index.mjs': NODE_HANDLER, 'user_function.mjs': compileTypeScript(code) };
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
  return { zip, files, ...LANGUAGE_RUNTIME[language] };
}

/** Hash of everything that requires a redeploy when it changes. */
export function deployHash(fn: Record<string, any>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([fn.language, fn.code, fn.timeout_seconds, fn.memory_mb]))
    .digest('hex')
    .slice(0, 16);
}
