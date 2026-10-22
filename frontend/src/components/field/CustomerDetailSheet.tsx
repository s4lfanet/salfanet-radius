'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { X, Phone, MessageCircle, Navigation, MapPin, Copy, Check, ExternalLink } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { StatusPill, customerStatus, ui, fmtRp } from '@/components/collector/ui';
import { mapsLinks } from './CustomerMap';
import { cn } from '@/lib/utils';

const CustomerMap = dynamic(() => import('./CustomerMap'), { ssr: false });

export interface DetailCustomer {
  id: string;
  name: string | null;
  username: string;
  customerId?: string | null;
  status: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  expiredAt?: string | null;
  installDate?: string | null;
  createdAt?: string | null;
  subscriptionType?: string | null;
  connectionType?: string | null;
  profile?: { name: string; price: number; downloadSpeed?: number; uploadSpeed?: number } | null;
  area?: { name: string } | null;
  router?: { name: string } | null;
}

const fmtDate = (d?: string | null) => (d ? formatWIB(d, 'dd MMM yyyy') : '-');
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-foreground text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Everything a collector or technician needs about one customer in the
 * field, with the location on a map and a route to it. `children` adds a
 * portal-specific section (the collector's invoices, for example).
 */
export default function CustomerDetailSheet({
  customer,
  onClose,
  actions,
  children,
}: {
  customer: DetailCustomer;
  onClose: () => void;
  /** Extra buttons next to Telepon / WhatsApp (e.g. Tagih). */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const st = customerStatus(customer.status);
  const hasPoint = customer.latitude != null && customer.longitude != null;
  const coords = hasPoint ? `${customer.latitude!.toFixed(6)}, ${customer.longitude!.toFixed(6)}` : '';
  const links = hasPoint ? mapsLinks(customer.latitude!, customer.longitude!) : null;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // navigator.clipboard exists only on HTTPS; installs opened over plain
  // http fall back to a hidden textarea and execCommand.
  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(coords);
        ok = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = coords;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      }
    } catch {
      ok = false;
    }
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 2000);
  };

  const speed = customer.profile?.downloadSpeed ? ` · ${customer.profile.downloadSpeed}/${customer.profile.uploadSpeed ?? '-'} Mbps` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">
      <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:w-[440px] max-h-[92dvh] md:max-h-none md:h-full overflow-y-auto rounded-t-2xl md:rounded-none border border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="customer-detail-title" className="text-lg font-bold text-foreground truncate">{customer.name || customer.username}</h3>
            <p className="text-xs text-muted-foreground truncate">{[customer.customerId, customer.username].filter(Boolean).join(' · ')}</p>
            <div className="mt-2"><StatusPill tone={st.tone}>{st.label}</StatusPill></div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup detail" className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {(customer.phone || actions) && (
            <div className="flex flex-wrap gap-2">
              {actions}
              {customer.phone && (
                <>
                  <a href={`tel:${customer.phone}`} className={cn(ui.btnSecondary, 'flex-1')}><Phone className="w-4 h-4" /> Telepon</a>
                  <a href={`https://wa.me/${waNumber(customer.phone)}`} target="_blank" rel="noopener noreferrer" className={cn(ui.btnSecondary, 'flex-1')}><MessageCircle className="w-4 h-4" /> WhatsApp</a>
                </>
              )}
            </div>
          )}

          {/* Same layout as the admin's customer detail: address, latitude and
              longitude, a map with a pin on the customer, then the link out. */}
          <section aria-labelledby="loc-title">
            <h4 id="loc-title" className="text-sm font-semibold text-foreground mb-2">Lokasi GPS</h4>
            {customer.address && <p className="text-sm text-foreground mb-3 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />{customer.address}</p>}
            {hasPoint && links ? (
              <>
                <dl className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-xl border border-border bg-background px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Latitude</dt>
                    <dd className="text-sm font-semibold text-foreground tabular-nums">{customer.latitude!.toFixed(6)}</dd>
                  </div>
                  <div className="rounded-xl border border-border bg-background px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Longitude</dt>
                    <dd className="text-sm font-semibold text-foreground tabular-nums">{customer.longitude!.toFixed(6)}</dd>
                  </div>
                </dl>
                <div className="rounded-2xl border border-border overflow-hidden">
                  <CustomerMap
                    pin
                    zoom={17}
                    className="h-56 rounded-none border-0"
                    points={[{ id: customer.id, name: customer.name || customer.username, subtitle: customer.address || undefined, lat: customer.latitude!, lng: customer.longitude!, tone: 'slate' }]}
                  />
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-t border-border">
                    <span className="text-xs text-muted-foreground tabular-nums">{coords}</span>
                    <a href={links.view} target="_blank" rel="noopener noreferrer" className="h-9 pointer-coarse:h-11 inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                      <ExternalLink className="w-3.5 h-3.5" /> Buka di Google Maps
                    </a>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <a href={links.directions} target="_blank" rel="noopener noreferrer" className={ui.btnPrimary}><Navigation className="w-4 h-4" /> Navigasi ke sini</a>
                  <button type="button" onClick={copy} className={ui.btnSecondary}>
                    {copied === 'ok' ? <><Check className="w-4 h-4" /> Tersalin</> : copied === 'fail' ? 'Gagal, salin manual' : <><Copy className="w-4 h-4" /> Salin koordinat</>}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground rounded-xl bg-muted p-3">Koordinat belum diisi. Admin atau teknisi bisa menambahkannya di data pelanggan.</p>
            )}
          </section>

          <section aria-labelledby="svc-title">
            <h4 id="svc-title" className="text-sm font-semibold text-foreground mb-1">Layanan</h4>
            <dl className="divide-y divide-border">
              <Row label="Paket">{customer.profile ? `${customer.profile.name} · ${fmtRp(customer.profile.price)}/bln${speed}` : '-'}</Row>
              <Row label="Router/NAS">{customer.router?.name || '-'}</Row>
              <Row label="Area">{customer.area?.name || '-'}</Row>
              <Row label="Tipe">{customer.subscriptionType === 'POSTPAID' ? 'Pascabayar' : customer.subscriptionType ? 'Prabayar' : '-'}{customer.connectionType ? ` · ${customer.connectionType}` : ''}</Row>
              <Row label="Aktif s/d">{fmtDate(customer.expiredAt)}</Row>
              {customer.installDate !== undefined && <Row label="Tanggal pasang">{fmtDate(customer.installDate)}</Row>}
            </dl>
          </section>

          {(customer.phone || customer.email) && (
            <section aria-labelledby="contact-title">
              <h4 id="contact-title" className="text-sm font-semibold text-foreground mb-1">Kontak</h4>
              <dl className="divide-y divide-border">
                {customer.phone && <Row label="Telepon">{customer.phone}</Row>}
                {customer.email && <Row label="Email">{customer.email}</Row>}
              </dl>
            </section>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
