/**
 * Root-level 404 page.
 * Shown when no route matches.
 */
import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Search className="w-10 h-10 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <h2 className="text-lg font-semibold mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        Halaman yang Anda cari tidak ada atau telah dipindahkan.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Home className="w-4 h-4" />
        Ke Beranda
      </Link>
    </div>
  );
}
