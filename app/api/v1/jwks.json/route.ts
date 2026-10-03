export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getPublicJWKS } from '@/lib/auth/jwks';

export async function GET(req: NextRequest) {
  const jwks = getPublicJWKS();
  return NextResponse.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
