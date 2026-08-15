/**
 * Root-level loading UI.
 * Shown by Next.js Suspense while a page is loading.
 */
import { Loader2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
      <p className="text-sm text-muted-foreground">Memuat...</p>
    </div>
  );
}
