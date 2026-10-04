import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo';

/**
 * Legacy mock endpoints are only served in demo mode. Elsewhere they answer 404
 * and point callers at the real platform MCP endpoint.
 */
export function demoOnlyGuard(
  replacement = 'POST /api/mcp/platform with a workspace API key'
): NextResponse | null {
  if (isDemoMode()) return null;
  return NextResponse.json(
    { error: `This legacy demo endpoint is disabled. Use ${replacement}.`, code: 'GONE' },
    { status: 404 }
  );
}
