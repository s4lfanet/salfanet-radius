/**
 * Centralized API client for frontend → backend communication.
 *
 * Architecture: 2 Next.js apps
 *   - frontend (port 3000): UI pages + components
 *   - backend  (port 3001): API routes + services + prisma
 *
 * URL resolution:
 *   - Server-side (SSR, generateMetadata): uses SERVER_API_URL or BACKEND_URL
 *   - Client-side (browser): uses relative path (nginx routes /api/* → backend)
 *
 * IMPORTANT: Next.js inlines process.env.* at build time. To prevent
 * server-only env vars from leaking into client bundles, we use:
 *   - NEXT_PUBLIC_API_URL for client-side (safe to inline, empty = relative)
 *   - A separate server-only module for server-side URL resolution
 *
 * Auth modes:
 *   - admin: NextAuth cookies (credentials: 'include')
 *   - customer: Bearer token from localStorage('customer_token')
 *   - agent: Bearer token from localStorage('agentToken')
 */

// Client-side API URL — NEXT_PUBLIC_ vars are safe to inline (empty = relative)
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Build full API URL for client-side (relative path via nginx).
 * This function is safe to call from client components.
 */
function buildUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  return `${CLIENT_API_URL}${path}`;
}

export type AuthMode = 'admin' | 'customer' | 'agent';

/**
 * Backend error response shapes (compatible with all known backend error formats).
 * Some routes return `{ error: string }`, others `{ success: false, error: string }`,
 * others `{ message: string }`. This union covers all cases.
 */
interface ApiErrorResponse {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
  success?: boolean;
}

/**
 * API error class — thrown by all apiCall variants.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Get Bearer token for a specific auth mode.
 * Returns null on server-side or if token not found.
 */
function getBearerToken(mode: AuthMode): string | null {
  if (typeof window === 'undefined') return null;
  switch (mode) {
    case 'customer':
      return localStorage.getItem('customer_token');
    case 'agent':
      return localStorage.getItem('agentToken');
    case 'admin':
    default:
      return null; // admin uses NextAuth cookies
  }
}

/**
 * Core API call function (client-side).
 * Uses relative path — nginx routes /api/* to backend.
 *
 * Content-Type handling:
 *   - FormData: browser sets multipart/form-data; boundary automatically — do NOT override
 *   - Blob / ArrayBuffer / ReadableStream: binary — do NOT set Content-Type
 *   - string (JSON): set Content-Type: application/json
 *   - no body (GET/DELETE): do NOT set Content-Type
 *
 * @param path  API path (e.g. '/api/pppoe/users')
 * @param options  fetch options (method, body, etc.)
 * @param mode  Auth mode: 'admin' (cookies), 'customer' (Bearer), 'agent' (Bearer)
 */
export async function apiCall<T = unknown>(
  path: string,
  options?: RequestInit,
  mode: AuthMode = 'admin',
): Promise<T> {
  const url = buildUrl(path);
  const token = getBearerToken(mode);

  // Build headers — only set Content-Type for JSON string bodies.
  // FormData, Blob, ArrayBuffer, and ReadableStream must NOT have
  // Content-Type forced, otherwise the browser cannot set the correct
  // multipart boundary or binary MIME type.
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const body = options?.body;
  const isJsonBody = typeof body === 'string';
  if (isJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  // Merge caller-provided headers (caller can override Content-Type if needed)
  if (options?.headers) {
    const callerHeaders = options.headers as Record<string, string>;
    for (const [key, value] of Object.entries(callerHeaders)) {
      headers[key] = value;
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: mode === 'admin' ? 'include' : 'same-origin',
    headers,
  });

  if (!res.ok) {
    let message = `API fetch failed: ${res.status} ${res.statusText}`;
    try {
      const error: ApiErrorResponse = await res.json();
      message = error.message || error.error || message;
    } catch {
      // Response body is not JSON (e.g. HTML error page, empty body)
      if (res.status === 401) {
        message = 'Unauthorized — please log in again';
      } else if (res.status === 403) {
        message = 'Forbidden — insufficient permissions';
      } else if (res.status === 404) {
        message = `Not found: ${path}`;
      } else if (res.status === 405) {
        message = `Method not allowed for ${path}`;
      } else if (res.status === 429) {
        message = 'Too many requests — please slow down';
      } else if (res.status >= 500) {
        message = `Server error (${res.status}) — please try again later`;
      }
    }
    throw new ApiError(res.status, message, path);
  }

  // Handle 204 No Content or empty body — return null for void responses
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return null as T;
  }

  return res.json();
}

/**
 * Admin API call (NextAuth cookies auth).
 */
export async function apiAdmin<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return apiCall<T>(path, options, 'admin');
}

/**
 * Customer API call (Bearer token from localStorage).
 */
export async function apiCustomer<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return apiCall<T>(path, options, 'customer');
}

/**
 * Agent API call (Bearer token from localStorage).
 */
export async function apiAgent<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return apiCall<T>(path, options, 'agent');
}

/**
 * Legacy: Client-side API fetch with auth token.
 * Kept for backward compatibility — prefer apiAdmin/apiCustomer/apiAgent.
 */
export async function apiFetchAuth<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return apiCall<T>(path, options, 'admin');
}

export { buildUrl };
