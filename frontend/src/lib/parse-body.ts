import 'server-only'
import { z, ZodSchema } from 'zod';
import { badRequest, validationError } from './api-response';

/**
 * Parse and validate request body against a Zod schema.
 * Returns `{ data, error }` — if error is set, return it directly from the route.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: ReturnType<typeof badRequest> }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, error: badRequest('Invalid JSON body') };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors as Record<string, string[]>;
    return { data: null, error: validationError(errors) };
  }

  return { data: result.data, error: null };
}

/**
 * Parse and validate URL search params against a Zod schema.
 * Returns `{ data, error }` — if error is set, return it directly from the route.
 */
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: ZodSchema<T>
): { data: T; error: null } | { data: null; error: ReturnType<typeof badRequest> } {
  const raw = Object.fromEntries(searchParams.entries());

  const result = schema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors as Record<string, string[]>;
    return { data: null, error: validationError(errors) };
  }

  return { data: result.data, error: null };
}

/** Convenience: parse a single required string param */
export function requireParam(
  params: Record<string, string>,
  key: string
): { value: string; error: null } | { value: null; error: ReturnType<typeof badRequest> } {
  const value = params[key];
  if (!value || typeof value !== 'string') {
    return { value: null, error: badRequest(`Missing required parameter: ${key}`) };
  }
  return { value, error: null };
}

// Re-export z so callers can do `import { z, parseBody } from '@/lib/parse-body'`
export { z };
