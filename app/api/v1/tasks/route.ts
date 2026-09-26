import { NextRequest, NextResponse } from 'next/server';
import { handleTaskIntake, handleListTasks } from '@/Backend/server';
import { db } from '@/Backend/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id') || undefined;
    const data = handleListTasks(tenantId);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleTaskIntake(body);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, validationErrors: result.validationErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'reset') {
      const tasks = db.resetToDefaults();
      return NextResponse.json({ success: true, tasks });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
