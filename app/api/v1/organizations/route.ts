import { NextResponse } from 'next/server';

// Global variable to persist state in memory across API requests in dev mode
declare global {
  var _mockOrgs: any[];
}

if (!global._mockOrgs) {
  global._mockOrgs = [];
}

export async function GET() {
  return NextResponse.json({ organizations: global._mockOrgs });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newOrg = {
      id: `org-${Date.now()}`,
      name: body.name,
      role: 'owner'
    };
    global._mockOrgs.push(newOrg);
    return NextResponse.json(newOrg, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
