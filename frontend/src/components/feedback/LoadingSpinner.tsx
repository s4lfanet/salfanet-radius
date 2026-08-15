/**
 * LoadingSpinner — consistent loading indicator.
 *
 * Usage:
 *   <LoadingSpinner text="Memuat data..." />
 *   <LoadingSpinner size="sm" />
 */
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({
  size = 'md',
  text = 'Memuat...',
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}>
      <Loader2 className={`${sizeMap[size]} text-primary animate-spin mb-3`} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
