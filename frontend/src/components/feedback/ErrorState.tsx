/**
 * ErrorState — consistent error display UI component.
 *
 * Usage:
 *   <ErrorState title="Gagal memuat data" onRetry={() => refetch()} />
 */
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Terjadi Kesalahan',
  description = 'Gagal memuat data. Silakan coba lagi.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Coba Lagi
        </button>
      )}
    </div>
  );
}
