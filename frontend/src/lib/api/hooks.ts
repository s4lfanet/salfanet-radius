/**
 * React Query hooks for API calls.
 *
 * These hooks wrap the existing apiAdmin/apiCustomer/apiAgent client functions
 * with React Query's caching, deduplication, and background refetching.
 *
 * Usage:
 *   const { data, isLoading, error } = useApiQuery('/api/pppoe/users', { page: 1 });
 *   const mutation = useApiMutation('/api/pppoe/users', { method: 'POST' });
 *
 * The query key is automatically derived from the path + params.
 */
'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryOptions,
  type UseMutationOptions,
  type QueryKey,
} from '@tanstack/react-query';
import { apiCall, apiAdmin, apiCustomer, apiAgent, type AuthMode } from '@/lib/api/client';

// ─── Query Key Helpers ──────────────────────────────────────────────────────

/**
 * Build a stable query key from path + params.
 * Sorts object keys so { a: 1, b: 2 } and { b: 2, a: 1 } produce the same key.
 */
function buildQueryKey(path: string, params?: Record<string, unknown>): QueryKey {
  if (!params) return [path];
  const sortedParams: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      sortedParams[key] = val;
    }
  }
  return [path, sortedParams];
}

/**
 * Append query params to a path.
 */
function buildPathWithParams(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const url = new URL(path, 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

// ─── useApiQuery ────────────────────────────────────────────────────────────

interface UseApiQueryOptions<TData, TError = Error> {
  /** Query parameters (appended to path as ?key=value) */
  params?: Record<string, unknown>;
  /** Auth mode: 'admin' (default), 'customer', 'agent' */
  mode?: AuthMode;
  /** Stale time in ms (default: 30s from QueryClient) */
  staleTime?: number;
  /** Refetch interval in ms (for polling) */
  refetchInterval?: number;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Keep previous data while fetching new data (for pagination) */
  placeholderData?: 'keepPreviousData';
  /** Additional React Query options */
  queryOptions?: Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'>;
}

export function useApiQuery<TData = unknown, TError = Error>(
  path: string,
  options?: UseApiQueryOptions<TData, TError>,
) {
  const {
    params,
    mode = 'admin',
    staleTime,
    refetchInterval,
    enabled = true,
    placeholderData,
    queryOptions,
  } = options || {};

  const fullPath = buildPathWithParams(path, params);
  const queryKey = buildQueryKey(path, params);

  return useQuery<TData, TError>({
    queryKey,
    queryFn: () => apiCall<TData>(fullPath, undefined, mode),
    staleTime,
    refetchInterval,
    enabled,
    placeholderData: placeholderData === 'keepPreviousData' ? keepPreviousData : undefined,
    ...queryOptions,
  });
}

// ─── useApiMutation ─────────────────────────────────────────────────────────

interface UseApiMutationOptions<TData, TVariables, TError = Error> {
  /** HTTP method: POST, PUT, PATCH, DELETE */
  method: string;
  /** Auth mode: 'admin' (default), 'customer', 'agent' */
  mode?: AuthMode;
  /** Query keys to invalidate after successful mutation */
  invalidateQueries?: QueryKey[];
  /** Whether to refetch type='active' queries after mutation */
  refetchType?: 'active' | 'inactive' | 'all' | 'none';
  /** Additional React Query options */
  mutationOptions?: Omit<
    UseMutationOptions<TData, TError, TVariables>,
    'mutationFn' | 'mutationKey'
  >;
}

/**
 * Serialize the body for fetch.
 * - Objects/arrays → JSON.stringify + Content-Type: application/json
 * - FormData → pass through (browser sets multipart boundary)
 * - Blob/ArrayBuffer/string → pass through
 */
function serializeBody(variables: unknown): BodyInit | undefined {
  if (variables === undefined || variables === null) return undefined;
  if (variables instanceof FormData) return variables;
  if (variables instanceof Blob) return variables;
  if (variables instanceof ArrayBuffer) return variables;
  if (typeof variables === 'string') return variables;
  return JSON.stringify(variables);
}

export function useApiMutation<TData = unknown, TVariables = unknown, TError = Error>(
  path: string,
  options: UseApiMutationOptions<TData, TVariables, TError>,
) {
  const { method, mode = 'admin', invalidateQueries, refetchType = 'active', mutationOptions } = options;
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables>({
    mutationFn: (variables: TVariables) =>
      apiCall<TData>(path, {
        method,
        body: serializeBody(variables),
      }, mode),
    onSuccess: () => {
      if (invalidateQueries) {
        for (const key of invalidateQueries) {
          queryClient.invalidateQueries({ queryKey: key, refetchType });
        }
      }
    },
    ...mutationOptions,
  });
}

// ─── Convenience wrappers ───────────────────────────────────────────────────

export function useAdminQuery<TData = unknown, TError = Error>(
  path: string,
  options?: Omit<UseApiQueryOptions<TData, TError>, 'mode'>,
) {
  return useApiQuery<TData, TError>(path, { ...options, mode: 'admin' });
}

export function useCustomerQuery<TData = unknown, TError = Error>(
  path: string,
  options?: Omit<UseApiQueryOptions<TData, TError>, 'mode'>,
) {
  return useApiQuery<TData, TError>(path, { ...options, mode: 'customer' });
}

export function useAgentQuery<TData = unknown, TError = Error>(
  path: string,
  options?: Omit<UseApiQueryOptions<TData, TError>, 'mode'>,
) {
  return useApiQuery<TData, TError>(path, { ...options, mode: 'agent' });
}

export { useQueryClient, buildQueryKey };
