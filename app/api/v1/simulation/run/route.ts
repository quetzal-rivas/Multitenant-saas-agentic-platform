export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { SimulationRunPayloadSchema } from '@/Backend/legacy_ts_mocks/simulation-schemas';
import { simulationEngine } from '@/Backend/legacy_ts_mocks/simulation-engine';

/**
 * POST /api/v1/simulation/run
 * 
 * Programmatic Simulation Execution Endpoint:
 * - Requires explicit isSimulation: true
 * - Validates payload shape via Zod
 * - Executes sandbox LangGraph supervisor loops and mock BullMQ queue promotion
 * - Bypasses live external LLM/telephony API costs
 * - Returns structured telemetry trace events with operational queue badges
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // Verify explicit isSimulation flag
    if (rawBody.isSimulation !== true) {
      return NextResponse.json(
        {
          error: 'Simulation Endpoint requires explicit { isSimulation: true } flag.',
          code: 'SIMULATION_FLAG_REQUIRED',
        },
        { status: 400 }
      );
    }

    // Validate payload shape with Zod
    const validation = SimulationRunPayloadSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorIssues = validation.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));

      return NextResponse.json(
        {
          error: 'Validation Error: Invalid simulation payload format',
          validationErrors: errorIssues,
        },
        { status: 400 }
      );
    }

    const payload = validation.data;
    const result = await simulationEngine.runSimulation(payload);

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('[API /api/v1/simulation/run] Error running simulation:', err);
    return NextResponse.json(
      {
        error: err.message || 'Internal server simulation error',
        code: 'SIMULATION_EXECUTION_FAILURE',
      },
      { status: 500 }
    );
  }
}
