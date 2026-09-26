import { NextRequest, NextResponse } from 'next/server';
import { handleSimulateCrash, handleSimulateRestart } from '@/Backend/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'simulate_crash') {
      const result = handleSimulateCrash();
      return NextResponse.json(result);
    }

    if (action === 'simulate_restart') {
      const result = handleSimulateRestart();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported system action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
