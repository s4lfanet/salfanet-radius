'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Copy, Loader2, AlertTriangle } from 'lucide-react';

interface QrisStatus {
  status: 'pending' | 'paid' | 'expired';
  qrImage: string | null;
  baseAmount: number;
  uniqueAmount: number;
  expiresAt: string;
  paidAt: string | null;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/** Only same-site paths, so the link cannot send payers elsewhere. */
function safeBack(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

/**
 * Hosted QRIS Mandiri page for every kind of order (voucher, top-up,
 * upgrade, agent deposit, invoice). Shows the QR with its exact amount,
 * counts down to expiry, and follows the payment until it settles.
 */
function QrisPayment() {
  const { orderId } = useParams<{ orderId: string }>();
  const back = safeBack(useSearchParams().get('back'));
  const [data, setData] = useState<QrisStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment/qris-status?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'QRIS tidak ditemukan');
      setData((prev) => ({ ...json, qrImage: json.qrImage ?? prev?.qrImage ?? null }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat QRIS');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Follow the payment while it is waiting.
  useEffect(() => {
    if (data?.status !== 'pending') return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data?.status, load]);

  useEffect(() => {
    if (!data?.expiresAt || data.status !== 'pending') return;
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setData((d) => (d ? { ...d, status: 'expired' } : d));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.expiresAt, data?.status]);

  const copyAmount = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(String(data.uniqueAmount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the amount is on screen */
    }
  };

  const backLink = back && (
    <a
      href={back}
      className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Lanjutkan
    </a>
  );

  if (error && !data) {
    return (
      <Shell>
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
        <h1 className="mt-3 text-lg font-bold text-foreground">QRIS tidak bisa dimuat</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={load}
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Coba lagi
        </button>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Menyiapkan QRIS…</p>
      </Shell>
    );
  }

  if (data.status === 'paid') {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
        <h1 className="mt-3 text-xl font-bold text-foreground">Pembayaran diterima</h1>
        <p className="mt-1 text-sm text-muted-foreground">{rupiah(data.uniqueAmount)} sudah tercatat. Rincian dikirim lewat WhatsApp atau notifikasi aplikasi.</p>
        {backLink}
      </Shell>
    );
  }

  if (data.status === 'expired') {
    return (
      <Shell>
        <Clock className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" />
        <h1 className="mt-3 text-lg font-bold text-foreground">QRIS sudah kedaluwarsa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jangan bayar QR ini lagi. Kembali dan pilih QRIS sekali lagi untuk mendapatkan kode baru.
          Kalau sudah terlanjur membayar, simpan bukti bayar dan hubungi admin.
        </p>
        {back && (
          <a
            href={back}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Kembali
          </a>
        )}
      </Shell>
    );
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <Shell>
      <h1 className="text-lg font-bold text-foreground">Bayar dengan QRIS</h1>
      <p className="mt-1 text-sm text-muted-foreground">Bisa dibayar dari aplikasi e-wallet atau m-banking apa pun.</p>

      {/* Light backing in both themes: scanners need dark modules on white. */}
      <div className="mx-auto mt-4 w-fit rounded-xl border border-border bg-white p-3">
        {data.qrImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.qrImage} alt={`Kode QRIS pembayaran ${rupiah(data.uniqueAmount)}`} width={240} height={240} className="h-60 w-60" />
        ) : (
          <div className="flex h-60 w-60 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        )}
      </div>

      <p className="mt-4 text-xs font-medium text-muted-foreground">Total bayar</p>
      <div className="mt-0.5 flex items-center justify-center gap-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">{rupiah(data.uniqueAmount)}</span>
        <button
          onClick={copyAmount}
          aria-label="Salin nominal"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {copied ? 'Nominal disalin' : data.uniqueAmount !== data.baseAmount ? `Termasuk kode unik ${rupiah(data.uniqueAmount - data.baseAmount)} untuk mengenali pembayaran Anda` : ' '}
      </p>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Menunggu pembayaran · berlaku</span>
        <span className="font-semibold tabular-nums text-foreground">{mm}:{ss}</span>
      </div>

      <ol className="mt-5 space-y-2 border-t border-border pt-4 text-left text-sm text-muted-foreground">
        <li className="flex gap-2"><span className="w-4 shrink-0 text-center font-semibold">1</span>Buka aplikasi bank atau e-wallet, pilih Scan/QRIS, lalu pindai kode di atas.</li>
        <li className="flex gap-2"><span className="w-4 shrink-0 text-center font-semibold">2</span>Pastikan nominal yang muncul {rupiah(data.uniqueAmount)}, lalu bayar.</li>
        <li className="flex gap-2"><span className="w-4 shrink-0 text-center font-semibold">3</span>Biarkan halaman ini terbuka. Status berubah sendiri setelah pembayaran masuk.</li>
      </ol>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-8 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">{children}</div>
    </main>
  );
}

export default function QrisPaymentPage() {
  return (
    <Suspense fallback={null}>
      <QrisPayment />
    </Suspense>
  );
}
