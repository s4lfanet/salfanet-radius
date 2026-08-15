'use client';

/**
 * Route-level error boundary for /agent/* segments.
 * Catches runtime errors thrown by any page under /agent and shows
 * a recovery UI instead of crashing the whole app.
 */
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Agent Error Boundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Terjadi Kesalahan</h2>
      <p className="text-sm text-muted-foreground mb-1 max-w-md">
        Halaman agen mengalami error yang tidak terduga.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/60 mb-4">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Coba Lagi
        </button>
        <Link
          href="/agent"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <Home className="w-4 h-4" />
          Ke Dashboard
        </Link>
      </div>
    </div>
  );
}
