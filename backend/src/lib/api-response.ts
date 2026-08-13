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
