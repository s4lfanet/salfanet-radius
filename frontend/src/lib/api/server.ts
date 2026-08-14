/**
 * Server-side API fetch helper.
 * Uses absolute URL to backend (needed for SSR, generateMetadata, server components).
 *
 * IMPORTANT: This module imports 'server-only' to prevent it from being
 * bundled into client code. This ensures SERVER_API_URL never leaks.
 */
import 'server-only';

/**
 * Build full API URL for server-side (absolute URL to backend).
 */
function buildServerUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  const baseUrl = process.env.SERVER_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';
  return `${baseUrl}${path}`;
}

/**
 * Server-side fetch helper (for server components, layouts, generateMetadata).
 * Uses absolute URL to backend. No auth token.
 *
 * Content-Type handling:
 *   - FormData: browser/Node sets multipart boundary automatically — do NOT override
 *   - Blob / ArrayBuffer / ReadableStream: binary — do NOT set Content-Type
 *   - string (JSON): set Content-Type: application/json
 *   - no body (GET/DELETE): do NOT set Content-Type
 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = buildServerUrl(path);

  const headers: Record<string, string> = {};
  const body = options?.body;
  if (typeof body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  if (options?.headers) {
    const callerHeaders = options.headers as Record<string, string>;
    for (const [key, value] of Object.entries(callerHeaders)) {
      headers[key] = value;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    cache: options?.cache ?? 'no-store',
  });

  if (!res.ok) {
    throw new Error(`API fetch failed: ${res.status} ${res.statusText} for ${path}`);
  }

  return res.json();
}

/**
 * Get public company info (no auth required).
 * Used by layout files for generateMetadata().
 */
export async function getCompanyInfo(): Promise<{ name?: string } | null> {
  try {
    const data = await apiFetch<{ name?: string }>('/api/company');
    return data || null;
  } catch {
    return null;
  }
}

export { buildServerUrl };
