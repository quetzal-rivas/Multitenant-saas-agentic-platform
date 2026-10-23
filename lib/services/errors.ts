/** Domain-level failure that callers map to HTTP 4xx or an MCP tool error. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FORBIDDEN' | 'LIMIT' = 'INVALID',
    public statusCode = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : code === 'LIMIT' ? 402 : 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** Why a plan or the platform refused an action (returned as the response `code`). */
export type LimitReason =
  | 'FEATURE_NOT_INCLUDED'
  | 'RESOURCE_LIMIT_REACHED'
  | 'MONTHLY_QUOTA_EXCEEDED'
  | 'CONCURRENCY_LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'INFRASTRUCTURE_CAPACITY_LIMIT';

export interface LimitDetails {
  limit_key?: string;
  limit?: number;
  used?: number;
  plan?: string;
  /** Upgrading the plan would lift this limit (false for platform capacity). */
  upgrade?: boolean;
}

const LIMIT_STATUS: Record<LimitReason, number> = {
  FEATURE_NOT_INCLUDED: 402,
  RESOURCE_LIMIT_REACHED: 402,
  MONTHLY_QUOTA_EXCEEDED: 402,
  CONCURRENCY_LIMIT_REACHED: 429,
  RATE_LIMITED: 429,
  INFRASTRUCTURE_CAPACITY_LIMIT: 503,
};

/** A plan limit, quota or platform-capacity refusal, with structured details for clients. */
export class LimitError extends ServiceError {
  constructor(message: string, public reason: LimitReason, public details: LimitDetails = {}) {
    super(message, 'LIMIT', LIMIT_STATUS[reason]);
  }
}

export function isLimitError(err: unknown): err is LimitError {
  return isServiceError(err) && (err as ServiceError).code === 'LIMIT' && typeof (err as LimitError).reason === 'string';
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError || (err as any)?.name === 'ServiceError';
}

/** Paging metadata in the shape MCP clients expect. */
export function pageInfo(total: number | null | undefined, offset: number, returned: number) {
  const totalCount = total ?? offset + returned;
  const hasMore = offset + returned < totalCount;
  return { total_count: totalCount, has_more: hasMore, next_offset: hasMore ? offset + returned : null };
}
