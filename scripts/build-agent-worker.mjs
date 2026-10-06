// Bundles the agent worker Lambda (cc-agent-worker) into dist/agent-worker/index.js.
// Handler: index.handler. Uses tsconfig paths (@/...) so the same runner code runs here.
import { build } from 'esbuild';

await build({
  entryPoints: ['lib/agent/worker-entry.ts'],
  outfile: 'dist/agent-worker/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  tsconfig: 'tsconfig.json',
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('Built dist/agent-worker/index.js');
