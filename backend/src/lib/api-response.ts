import 'server-only'
import { NextResponse } from 'next/server';

export const ok = <T>(data: T) =>
  NextResponse.json(data as never, { status: 200 });

export const created = <T>(data: T) =>
  NextResponse.json(data as never, { status: 201 });

export const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

export const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export const forbidden = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 });

export const notFound = (resource = 'Resource') =>
  NextResponse.json({ error: `${resource} not found` }, { status: 404 });

export const conflict = (error: string) =>
  NextResponse.json({ error }, { status: 409 });

export const serverError = (error?: string) =>
  NextResponse.json(
    { error: error ?? 'Internal server error' },
    { status: 500 }
  );

export const validationError = (errors: Record<string, string[]>) =>
  NextResponse.json({ error: 'Validation failed', errors }, { status: 422 });

/**
 * Safe error handler — maps Prisma errors to generic user-facing messages
 * without exposing database internals (error codes, SQL, table names, paths).
 *
 * Usage in catch blocks:
 *   } catch (error) {
 *     console.error('My operation failed:', error);
 *     return safeErrorResponse(error);
 *   }
 *
 * The raw error is still logged server-side via console.error for debugging.
 */
export function safeErrorResponse(error: unknown): NextResponse {
  // Log full error server-side for debugging
  console.error('[API Error]', error);

  // Map known Prisma error codes to generic messages
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    switch (code) {
      case 'P2002':
        return conflict('A record with this value already exists');
      case 'P2025':
        return notFound('Record');
      case 'P2003':
        return badRequest('Referenced record does not exist');
      case 'P2014':
        return badRequest('Invalid relation in request');
      default:
        // Unknown Prisma error — don't expose the code
        return serverError('Database operation failed');
    }
  }

  // Generic fallback — never expose error.message to client
  return serverError('Internal server error');
}
