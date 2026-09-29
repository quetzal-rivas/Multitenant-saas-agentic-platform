import { NextResponse } from 'next/server';

declare global {
  var _mockOrgs: any[];
}

if (!global._mockOrgs) {
  global._mockOrgs = [];
}

export async function GET() {
  return NextResponse.json({ organizations: global._mockOrgs });
}
