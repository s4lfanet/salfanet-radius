import { NextResponse } from 'next/server';
import type { ApiEnvelope } from './types';

/** Build envelope-style success response. */
export function ok<T>(data: T, total?: number): NextResponse {
  const body: ApiEnvelope<T> =
    total !== undefined ? { success: true, data, total } : { success: true, data };
  return NextResponse.json(body);
}

/** Build envelope-style error response. */
export function fail(error: string, status = 500): NextResponse {
  return NextResponse.json<ApiEnvelope<never>>({ success: false, error }, { status });
}

/** Convert anything (xsd-tagged arrays, _value objects, etc.) to a display string. */
export function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length ? safeString(val[0]) : '';
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    if ('_value' in o) return safeString(o._value);
    if ('value' in o) return safeString(o.value);
  }
  return '';
}

/** Resolve a dotted parameter path inside a device tree, returning the underlying _value. */
export function getParamValue(device: unknown, path: string): string {
  const parts = path.split('.');
  let cur: unknown = device;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return '';
    }
  }
  return safeString(cur);
}

/** Build a Basic Auth header from optional credentials. */
export function basicAuthHeader(username?: string, password?: string): Record<string, string> {
  if (!username) return {};
  const token = Buffer.from(`${username}:${password ?? ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/** Encode a path segment safely for NBI URLs (preserves dots). */
export function encodeSegment(seg: string): string {
  return encodeURIComponent(seg);
}
