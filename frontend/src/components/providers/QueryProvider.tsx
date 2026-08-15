'use client';

/**
 * React Query Provider — wraps the app with QueryClient.
 *
 * Provides client-side data caching, deduplication, and background refetching
 * via @tanstack/react-query.
 */
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 30 seconds by default.
            // Pages can override per-query with `staleTime`.
            staleTime: 30 * 1000,
            // Keep cached data in memory for 5 minutes after unmount.
            gcTime: 5 * 60 * 1000,
            // Retry failed requests once.
            retry: 1,
            // Don't refetch on window focus by default (can be noisy).
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
