/** Domain-level failure that callers map to HTTP 4xx or an MCP tool error. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FORBIDDEN' = 'INVALID',
    public statusCode = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
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
