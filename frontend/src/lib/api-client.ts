/**
 * Centralized API client for frontend → backend communication.
 *
 * Uses NEXT_PUBLIC_API_URL env var to determine the backend URL.
 * Falls back to /api/* (Next.js API routes) if not set.
 *
 * All backend logic is now in Next.js API routes (no NestJS backend).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Build full API URL. If NEXT_PUBLIC_API_URL is set, calls backend directly.
 * Otherwise, uses relative path (same origin, legacy Next.js routes).
 */
function buildUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${path}`;
  }
  // Default: relative path to Next.js API routes
  return path;
}

/**
 * Server-side fetch helper (for server components, layouts, generateMetadata).
 * Uses Node.js fetch (Node 18+).
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
    // Disable cache for server-side data that should be fresh
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
