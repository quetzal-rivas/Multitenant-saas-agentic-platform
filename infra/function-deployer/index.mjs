// cc-function-deployer: creates AI Function Studio Lambdas on behalf of the web app.
// Amplify's SSR compute role cannot pass IAM roles (Amplify denies iam:PassRole in its
// session policy), so creation happens here. This function accepts only tenant function
// names (ccfn-<32 hex>), the two supported runtimes and bounded limits, and always uses
// the logs-only execution role from its own environment.
import { LambdaClient, CreateFunctionCommand } from '@aws-sdk/client-lambda';

const client = new LambdaClient({});
const EXEC_ROLE_ARN = process.env.EXEC_ROLE_ARN;
const RUNTIMES = { 'python3.12': 'handler.handler', 'nodejs22.x': 'index.handler' };

export const handler = async (event) => {
  const { FunctionName, Runtime, Handler, Timeout, MemorySize, Environment, Description, Tags, ZipFileBase64 } = event || {};
  if (!/^ccfn-[0-9a-f]{32}$/.test(FunctionName || '')) throw new Error('Invalid function name');
  if (RUNTIMES[Runtime] !== Handler) throw new Error('Unsupported runtime or handler');
  if (!Number.isInteger(Timeout) || Timeout < 1 || Timeout > 30) throw new Error('Timeout must be 1-30 seconds');
  if (!Number.isInteger(MemorySize) || MemorySize < 128 || MemorySize > 1024) throw new Error('MemorySize must be 128-1024 MB');
  if (typeof ZipFileBase64 !== 'string' || ZipFileBase64.length > 2_000_000) throw new Error('Invalid package');
  const vars = Environment?.Variables || {};
  if (Object.keys(vars).some((k) => !/^[A-Z][A-Z0-9_]{0,63}$/.test(k))) throw new Error('Invalid environment variable name');

  const res = await client.send(
    new CreateFunctionCommand({
      FunctionName,
      Runtime,
      Handler,
      Timeout,
      MemorySize,
      Role: EXEC_ROLE_ARN,
      Architectures: ['arm64'],
      Code: { ZipFile: Buffer.from(ZipFileBase64, 'base64') },
      Environment: { Variables: vars },
      Description: String(Description || '').slice(0, 256),
      Tags: Tags && typeof Tags === 'object' ? Tags : undefined,
    })
  );
  return { FunctionArn: res.FunctionArn, State: res.State };
};
