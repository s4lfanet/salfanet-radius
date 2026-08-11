'use client';

/**
 * Global error boundary — replaces Next.js auto-generated /_global-error.
 * Must be a Client Component and include <html>/<body> tags because it
 * renders in place of the root layout when an unrecoverable error occurs.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#0a0a0a', color: '#e5e5e5' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Terjadi Kesalahan</h2>
          <p style={{ color: '#888', marginBottom: '20px' }}>Halaman mengalami error yang tidak terduga.</p>
          <button
            onClick={reset}
            style={{ padding: '10px 20px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  );
}
