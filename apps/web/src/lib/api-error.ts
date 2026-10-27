import { z } from 'zod';

const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

// Non-JSON bodies (a proxy's HTML 502, an empty 500) still become an ApiError, so callers only
// ever handle one error type.
export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = errorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(response.status, code, message, details);
  }
  return new ApiError(response.status, 'UNKNOWN', `Request failed with status ${response.status}`);
}
