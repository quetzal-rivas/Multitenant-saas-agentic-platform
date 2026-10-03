import { NextResponse } from 'next/server';

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  [key: string]: any;
}

/**
 * Format RFC 9457 problem+json error response.
 */
export function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  extra: Record<string, any> = {}
): NextResponse {
  const problem: ProblemDetails = {
    type: extra.type || 'https://contextcontrol.io/errors/' + title.toLowerCase().replace(/\s+/g, '-'),
    title,
    status,
    detail,
    ...extra,
  };

  return NextResponse.json(problem, {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
    },
  });
}
