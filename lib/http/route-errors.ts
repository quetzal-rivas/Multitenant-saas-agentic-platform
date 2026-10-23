import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isAuthError } from '@/lib/auth/require-auth';
import { isLimitError, isServiceError } from '@/lib/services/errors';

/** Map auth, validation and domain errors to JSON responses; hide everything else. */
export function errorResponse(err: unknown, context: string) {
  if (isAuthError(err)) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request', code: 'INVALID_REQUEST', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 }
    );
  }
  if (isLimitError(err)) {
    return NextResponse.json({ error: err.message, code: err.reason, ...err.details }, { status: err.statusCode });
  }
  if (isServiceError(err)) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
  console.error(`[${context}]`, err);
  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
}
