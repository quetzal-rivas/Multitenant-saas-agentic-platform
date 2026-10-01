import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const body = await req.json();
    const {
      language = 'python',
      code = '',
      input = {},
      envVars = {},
      timeoutSeconds = 15,
    } = body;

    const timeoutMs = Math.min(Math.max(timeoutSeconds, 1), 30) * 1000;

    if (!code.trim()) {
      return NextResponse.json({
        success: false,
        error: 'No code supplied for execution',
        durationMs: 0,
        executionId,
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Python execution sandbox
    if (language === 'python') {
      const runnerCode = `
import json
import os
import sys

# Inject environment secrets
for k, v in ${JSON.stringify(envVars)}.items():
    os.environ[k] = str(v)

${code}

if __name__ == '__main__':
    args = ${JSON.stringify(input)}
    try:
        if 'main' in globals():
            result = main(**args) if isinstance(args, dict) else main(args)
        else:
            result = {"message": "Execution finished (no main function declared)"}
        print("___RESULT_JSON___" + json.dumps(result))
    except Exception as e:
        print("___ERROR_JSON___" + json.dumps({"error": str(e), "type": type(e).__name__}), file=sys.stderr)
        sys.exit(1)
`;

      const tmpDir = os.tmpdir();
      const tmpFilePath = path.join(tmpDir, `${executionId}.py`);
      fs.writeFileSync(tmpFilePath, runnerCode, 'utf8');

      return new Promise<NextResponse>((resolve) => {
        const proc = spawn('python3', [tmpFilePath], {
          env: { ...process.env, ...envVars },
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
          killed = true;
          proc.kill('SIGTERM');
        }, timeoutMs);

        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });

        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          try {
            if (fs.existsSync(tmpFilePath)) {
              fs.unlinkSync(tmpFilePath);
            }
          } catch {
            // ignore
          }

          const durationMs = Date.now() - startTime;

          if (killed) {
            resolve(
              NextResponse.json({
                success: false,
                error: `Execution timed out after ${timeoutSeconds}s`,
                stdout,
                stderr,
                durationMs,
                executionId,
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          if (code !== 0) {
            let errorDetail = stderr.trim();
            if (stderr.includes('___ERROR_JSON___')) {
              try {
                const parsed = JSON.parse(stderr.split('___ERROR_JSON___')[1]);
                errorDetail = `${parsed.type}: ${parsed.error}`;
              } catch {
                // fallback
              }
            }
            resolve(
              NextResponse.json({
                success: false,
                error: errorDetail || `Process exited with code ${code}`,
                stdout,
                stderr,
                durationMs,
                executionId,
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          let output: any = stdout.trim();
          let cleanStdout = stdout;

          if (stdout.includes('___RESULT_JSON___')) {
            const parts = stdout.split('___RESULT_JSON___');
            cleanStdout = parts[0].trim();
            try {
              output = JSON.parse(parts[1].trim());
            } catch {
              output = parts[1].trim();
            }
          }

          resolve(
            NextResponse.json({
              success: true,
              output,
              stdout: cleanStdout,
              stderr: stderr.trim(),
              durationMs,
              executionId,
              timestamp: new Date().toISOString(),
            })
          );
        });
      });
    }

    // 2. JavaScript / TypeScript / Node execution sandbox
    const runnerCode = `
const input = ${JSON.stringify(input)};

${code}

(async () => {
  try {
    let result;
    if (typeof main === 'function') {
      result = await main(input);
    } else {
      result = { message: "Execution finished (no main function declared)" };
    }
    console.log("___RESULT_JSON___" + JSON.stringify(result));
  } catch (err) {
    console.error("___ERROR_JSON___" + JSON.stringify({ error: err.message, stack: err.stack }));
    process.exit(1);
  }
})();
`;

    const tmpDir = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, `${executionId}.js`);
    fs.writeFileSync(tmpFilePath, runnerCode, 'utf8');

    return new Promise<NextResponse>((resolve) => {
      const proc = spawn('node', [tmpFilePath], {
        env: { ...process.env, ...envVars },
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
      }, timeoutMs);

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        try {
          if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
          }
        } catch {
          // ignore
        }

        const durationMs = Date.now() - startTime;

        if (killed) {
          resolve(
            NextResponse.json({
              success: false,
              error: `Execution timed out after ${timeoutSeconds}s`,
              stdout,
              stderr,
              durationMs,
              executionId,
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        if (code !== 0) {
          let errorDetail = stderr.trim();
          if (stderr.includes('___ERROR_JSON___')) {
            try {
              const parsed = JSON.parse(stderr.split('___ERROR_JSON___')[1]);
              errorDetail = parsed.error;
            } catch {
              // fallback
            }
          }
          resolve(
            NextResponse.json({
              success: false,
              error: errorDetail || `Process exited with code ${code}`,
              stdout,
              stderr,
              durationMs,
              executionId,
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        let output: any = stdout.trim();
        let cleanStdout = stdout;

        if (stdout.includes('___RESULT_JSON___')) {
          const parts = stdout.split('___RESULT_JSON___');
          cleanStdout = parts[0].trim();
          try {
            output = JSON.parse(parts[1].trim());
          } catch {
            output = parts[1].trim();
          }
        }

        resolve(
          NextResponse.json({
            success: true,
            output,
            stdout: cleanStdout,
            stderr: stderr.trim(),
            durationMs,
            executionId,
            timestamp: new Date().toISOString(),
          })
        );
      });
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime,
        executionId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
