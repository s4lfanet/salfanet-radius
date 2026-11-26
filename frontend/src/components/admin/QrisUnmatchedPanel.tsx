'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { formatWIB } from '@/lib/timezone';
import { showConfirm, showError, showSuccess } from '@/lib/sweetalert';

interface Candidate {
  pendingId: string;
  orderId: string;
  baseAmount: number;
  uniqueAmount: number;
  expired: boolean;
  expiresAt: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  customerName: string | null;
  customerUsername: string | null;
}

interface Item {
  id: string;
  kind: 'unmatched' | 'ambiguous' | 'error';
  amount: number | null;
  sourceApp: string | null;
  rawText: string | null;
  reason: string | null;
  createdAt: string;
  candidates: Candidate[];
}

const KIND_LABEL: Record<Item['kind'], string> = {
  unmatched: 'Tidak ada QR yang cocok',
  ambiguous: 'Cocok dengan lebih dari satu QR',
  error: 'Gagal diproses',
};

const rp = (n: number | null) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`;

/**
 * QRIS notifications that were not settled automatically (paid after the
 * QR expired, two QRs with the same nominal, or a failed settlement).
 * The admin matches each to its order, retries it, or dismisses it.
 */
export function QrisUnmatchedPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiAdmin<{ items: Item[] }>('/api/payment-gateway/qris-mandiri/unmatched');
      setItems(data.items || []);
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Gagal memuat notifikasi QRIS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(item: Item, body: Record<string, unknown>, confirmText: string) {
    const ok = await showConfirm(confirmText, 'Konfirmasi');
    if (!ok) return;
    setBusy(item.id);
    try {
      await apiAdmin(`/api/payment-gateway/qris-mandiri/unmatched/${item.id}`, { method: 'POST', body: JSON.stringify(body) });
      await showSuccess('Selesai');
      await load();
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Gagal memproses');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Pembayaran QRIS belum cocok ({items.length})
          </p>
          <p className="text-[10px] text-muted-foreground">Uang masuk yang tidak menemukan QR aktif, misalnya dibayar setelah QR kedaluwarsa.</p>
        </div>
        <button type="button" onClick={load} title="Muat ulang" className="p-1.5 rounded-lg border border-border hover:bg-muted">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Semua pembayaran QRIS sudah tercocokkan.</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="space-y-1.5 rounded-lg bg-muted/40 p-2.5 text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-foreground">{rp(item.amount)} <span className="font-normal text-muted-foreground">· {KIND_LABEL[item.kind]}</span></p>
                <p className="text-muted-foreground">{formatWIB(new Date(item.createdAt), 'dd/MM/yyyy HH:mm')}{item.sourceApp ? ` · ${item.sourceApp}` : ''}</p>
              </div>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => act(item, { action: 'dismiss' }, 'Tandai notifikasi ini sebagai bukan pembayaran pelanggan?')}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] hover:bg-muted"
              >
                Abaikan
              </button>
            </div>
            {item.rawText && <p className="truncate text-muted-foreground" title={item.rawText}>&ldquo;{item.rawText}&rdquo;</p>}
            {item.reason && <p className="text-muted-foreground">{item.reason}</p>}

            {item.kind === 'error' ? (
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => act(item, { action: 'retry' }, 'Proses ulang pembayaran ini?')}
                className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
              >
                Proses ulang
              </button>
            ) : item.candidates.length === 0 ? (
              <p className="text-amber-600 dark:text-amber-400">Tidak ada pesanan QRIS dengan nominal ini. Cek tagihan secara manual, lalu Abaikan.</p>
            ) : (
              item.candidates.map((c) => (
                <div key={c.pendingId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{c.customerName || c.customerUsername || c.orderId}</p>
                    <p className="text-muted-foreground">
                      {c.invoiceNumber ?? c.orderId} · tagihan {rp(c.baseAmount)} · {c.expired ? 'QR kedaluwarsa' : 'QR masih aktif'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => act(item, { action: 'settle', pendingId: c.pendingId }, `Tandai ${c.invoiceNumber ?? c.orderId} (${c.customerName ?? c.customerUsername ?? '-'}) sudah dibayar ${rp(item.amount)}?`)}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Cocokkan
                  </button>
                </div>
              ))
            )}
          </div>
        ))
      )}
    </div>
  );
}
