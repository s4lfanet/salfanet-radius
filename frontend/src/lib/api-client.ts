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
 */

// Server-side: absolute URL to backend (needed for SSR/generateMetadata)
// Client-side: empty string (relative path, nginx handles routing)
const isServer = typeof window === 'undefined';
const SERVER_API_URL = process.env.SERVER_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const API_BASE_URL = isServer ? SERVER_API_URL : CLIENT_API_URL;

/**
 * Build full API URL.
 */
function buildUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  return `${API_BASE_URL}${path}`;
}

/**
 * Server-side fetch helper (for server components, layouts, generateMetadata).
 */
export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = buildUrl(path);
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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

/**
 * Client-side API fetch with auth token.
 * Automatically includes Bearer token from localStorage/cookie.
 */
export async function apiFetchAuth<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = buildUrl(path);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API fetch failed: ${res.status}`);
  }

  return res.json();
}

export { API_BASE_URL };
