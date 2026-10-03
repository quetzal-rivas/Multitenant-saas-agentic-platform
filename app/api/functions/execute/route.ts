export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: 'Forbidden',
      code: 'UNSANDBOXED_EXECUTION_DISABLED',
      message: 'Arbitrary code execution on platform infrastructure is disabled for security compliance.',
    },
    { status: 403 }
  );
}

