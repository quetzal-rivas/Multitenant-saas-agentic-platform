import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Initialize AWS Lambda Client
// Will default to process.env.AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// The ARN of the universal stateless wrapper Lambda function
const EXECUTOR_LAMBDA_ARN = process.env.AWS_STATELESS_EXECUTOR_ARN || 'arn:aws:lambda:us-east-1:123456789012:function:context-control-executor';

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

    if (!code.trim()) {
      return NextResponse.json({
        success: false,
        error: 'No code supplied for execution',
        durationMs: 0,
        executionId,
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    const payloadStr = JSON.stringify({
      language,
      code,
      input,
      envVars,
      timeoutSeconds
    });

    // Invoke the Lambda function
    const command = new InvokeCommand({
      FunctionName: EXECUTOR_LAMBDA_ARN,
      InvocationType: 'RequestResponse', // Synchronous execution
      Payload: Buffer.from(payloadStr),
    });

    const response = await lambdaClient.send(command);
    const durationMs = Date.now() - startTime;

    // Decode the response payload
    const responsePayloadStr = response.Payload ? Buffer.from(response.Payload).toString('utf-8') : '{}';
    
    let responseData;
    try {
      responseData = JSON.parse(responsePayloadStr);
    } catch {
      responseData = responsePayloadStr;
    }

    if (response.FunctionError) {
      // Unhandled error in the lambda container
      return NextResponse.json({
        success: false,
        error: `Lambda Execution Error: ${response.FunctionError}`,
        details: responseData,
        durationMs,
        executionId,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Assuming the wrapper returns { output: ..., stdout: ..., stderr: ... }
    return NextResponse.json({
      success: true,
      output: responseData.output || responseData,
      stdout: responseData.stdout || '',
      stderr: responseData.stderr || '',
      durationMs,
      executionId,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to invoke AWS Lambda',
        durationMs: Date.now() - startTime,
        executionId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
