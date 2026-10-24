'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { X, Phone, MessageCircle, Navigation, MapPin, Copy, Check, ExternalLink, Map as MapIcon, LocateFixed, Loader2 } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { StatusPill, customerStatus, ui, fmtRp } from '@/components/collector/ui';
import { mapsLinks } from './CustomerMap';
import { cn } from '@/lib/utils';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

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
    <div className="flex items-start justify-between gap-4 py-1.5">
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
  onSaveLocation,
}: {
  customer: DetailCustomer;
  onClose: () => void;
  /** Extra buttons next to Telepon / WhatsApp (e.g. Tagih). */
  actions?: ReactNode;
  children?: ReactNode;
  /** When given, the location can be changed here (Pilih di Peta / GPS Auto), like the admin's detail. */
  onSaveLocation?: (lat: number, lng: number) => Promise<void>;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // A picked point waits here until Simpan, so a mis-tap never overwrites the saved one.
  const [pending, setPending] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gpsState, setGpsState] = useState<'idle' | 'reading' | string>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const st = customerStatus(customer.status);
  // Coordinates can arrive as strings (older API builds, form input); doing
  // arithmetic on a string concatenates, which threw the map off its pin.
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const lat = num(pending?.lat ?? customer.latitude);
  const lng = num(pending?.lng ?? customer.longitude);
  const hasPoint = lat != null && lng != null;
  const coords = hasPoint ? `${lat!.toFixed(6)}, ${lng!.toFixed(6)}` : '';
  const links = hasPoint ? mapsLinks(lat!, lng!) : null;
  // OpenStreetMap embed (as in the admin), framed tightly around the pin so it sits in the middle.
  const osmSrc = hasPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${(lng! - 0.003).toFixed(6)}%2C${(lat! - 0.002).toFixed(6)}%2C${(lng! + 0.003).toFixed(6)}%2C${(lat! + 0.002).toFixed(6)}&layer=mapnik&marker=${lat!.toFixed(6)}%2C${lng!.toFixed(6)}`
    : '';

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pickerOpen]);

  // Phone GPS needs a secure page (HTTPS); say so instead of failing silently.
  const readGps = () => {
    setSaveError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsState('GPS Auto butuh alamat HTTPS. Pakai Pilih di Peta.');
      return;
    }
    setGpsState('reading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPending({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsState('idle');
      },
      (err) => setGpsState(
        err.code === err.PERMISSION_DENIED ? 'Izin lokasi ditolak. Izinkan lokasi untuk browser ini, lalu coba lagi.'
          : err.code === err.TIMEOUT ? 'GPS terlalu lama merespons. Coba di tempat terbuka.'
          : 'Lokasi tidak didapat dari GPS.',
      ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const save = async () => {
    if (!pending || !onSaveLocation) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveLocation(pending.lat, pending.lng);
      setPending(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Lokasi gagal disimpan');
    } finally {
      setSaving(false);
    }
  };

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
    // Compact: a centred dialog on wide screens, a bottom sheet on phones;
    // never taller than 85% of the screen.
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">
      <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-[480px] md:max-w-[860px] max-h-[85dvh] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 bg-card border-b border-border pl-5 pr-2 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 id="customer-detail-title" className="text-sm font-bold text-foreground truncate">{customer.name || customer.username}</h3>
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </div>
            <p className="text-xs text-muted-foreground truncate">{[customer.customerId, customer.username].filter(Boolean).join(' · ')}</p>
          </div>
          {customer.phone && (
            <>
              <a href={`tel:${customer.phone}`} aria-label="Telepon pelanggan" className="h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] shrink-0 flex items-center justify-center rounded-xl hover:bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <Phone className="w-5 h-5" />
              </a>
              <a href={`https://wa.me/${waNumber(customer.phone)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp pelanggan" className="h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] shrink-0 flex items-center justify-center rounded-xl hover:bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <MessageCircle className="w-5 h-5" />
              </a>
            </>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup detail" className="h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] shrink-0 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wide screens: map on the left, details on the right, so the dialog
            stays short enough to see whole. Phones: one column. */}
        <div className="px-5 py-4 grid gap-5 md:grid-cols-2 md:gap-6">
          {actions && <div className="flex md:col-span-2">{actions}</div>}

          {/* Same layout as the admin's customer detail: address, latitude and
              longitude, a map with a pin on the customer, then the link out. */}
          <section aria-labelledby="loc-title" className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 id="loc-title" className="text-sm font-semibold text-foreground">Lokasi GPS</h4>
              {onSaveLocation && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => { setSaveError(null); setPickerOpen(true); }} className="h-[36px] pointer-coarse:h-[44px] px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    <MapIcon className="w-4 h-4" /> Pilih di Peta
                  </button>
                  <button type="button" onClick={readGps} disabled={gpsState === 'reading'} className="h-[36px] pointer-coarse:h-[44px] px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    {gpsState === 'reading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} GPS Auto
                  </button>
                </div>
              )}
            </div>
            {customer.address && <p className="text-sm text-muted-foreground mb-2 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" />{customer.address}</p>}
            {onSaveLocation && (
              <div className="mb-2 space-y-2">
                {gpsState !== 'idle' && gpsState !== 'reading' && (
                  <p className="text-sm text-amber-700 dark:text-amber-400" role="status">{gpsState}</p>
                )}
                {pending && (
                  <div className="rounded-xl border border-blue-600/40 bg-blue-600/10 p-3" role="status">
                    <p className="text-sm font-semibold text-foreground">Titik baru belum disimpan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Periksa pin di peta.{pending.accuracy ? ` Akurasi GPS sekitar ${Math.round(pending.accuracy)} m.` : ''}
                      {customer.latitude != null && customer.longitude != null ? ` Titik lama: ${customer.latitude.toFixed(6)}, ${customer.longitude.toFixed(6)}.` : ''}
                    </p>
                    {saveError && <p className="text-sm text-red-700 dark:text-red-400 mt-2" role="alert">{saveError}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setPending(null); setSaveError(null); }} className={ui.btnSecondary}>Batal</button>
                      <button type="button" onClick={save} disabled={saving} className={ui.btnPrimary}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Simpan lokasi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {hasPoint && links ? (
              // One card: the admin's OpenStreetMap preview with the pin, then
              // latitude / longitude once, with copy and Google Maps beside them.
              <div className={cn('rounded-xl overflow-hidden border', pending ? 'border-blue-600/60' : 'border-border')}>
                <iframe
                  key={osmSrc}
                  src={osmSrc}
                  className="w-full h-52 border-0 block"
                  title={`Peta lokasi ${customer.name || customer.username}`}
                  loading="lazy"
                />
                <div className="flex items-center gap-1 pl-3 pr-1 py-1 border-t border-border bg-muted/40">
                  <dl className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 font-mono text-xs tabular-nums">
                    <div className="min-w-0"><dt className="sr-only">Latitude</dt><dd aria-label="Latitude" className="text-foreground truncate"><span className="text-muted-foreground">Lat </span>{lat!.toFixed(6)}</dd></div>
                    <div className="min-w-0"><dt className="sr-only">Longitude</dt><dd aria-label="Longitude" className="text-foreground truncate"><span className="text-muted-foreground">Lng </span>{lng!.toFixed(6)}</dd></div>
                  </dl>
                  <button type="button" onClick={copy} aria-label={copied === 'ok' ? 'Koordinat tersalin' : 'Salin koordinat'} title="Salin koordinat" className="h-[40px] w-[40px] pointer-coarse:h-[44px] pointer-coarse:w-[44px] shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    {copied === 'ok' ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a href={links.view} target="_blank" rel="noopener noreferrer" aria-label="Buka di Google Maps" title="Buka di Google Maps" className="h-[40px] w-[40px] pointer-coarse:h-[44px] pointer-coarse:w-[44px] shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                {copied === 'fail' && <p className="px-3 pb-2 text-xs text-amber-700 dark:text-amber-400" role="status">Tidak bisa menyalin otomatis. Tekan lama koordinat untuk menyalin.</p>}
                <div className="p-2 border-t border-border">
                  <a href={links.directions} target="_blank" rel="noopener noreferrer" className={cn(ui.btnPrimary, 'w-full')}>
                    <Navigation className="w-4 h-4" /> Navigasi ke lokasi
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground rounded-xl bg-muted p-3">
                {onSaveLocation ? 'Koordinat belum diisi. Pakai Pilih di Peta atau GPS Auto di atas.' : 'Koordinat belum diisi. Admin atau teknisi bisa menambahkannya di data pelanggan.'}
              </p>
            )}
          </section>

          {pickerOpen && (
            <MapPicker
              isOpen={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={(pLat, pLng) => { setPending({ lat: pLat, lng: pLng }); setPickerOpen(false); }}
              {...(lat != null && lng != null ? { initialLat: lat, initialLng: lng } : {})}
            />
          )}

          <div className="min-w-0 space-y-4">
            <section aria-labelledby="svc-title">
              <h4 id="svc-title" className="text-sm font-semibold text-foreground mb-1">Data pelanggan</h4>
              <dl className="divide-y divide-border">
                <Row label="Paket">{customer.profile ? `${customer.profile.name} · ${fmtRp(customer.profile.price)}/bln${speed}` : '-'}</Row>
                <Row label="Router/NAS">{customer.router?.name || '-'}</Row>
                <Row label="Area">{customer.area?.name || '-'}</Row>
                <Row label="Tipe">{customer.subscriptionType === 'POSTPAID' ? 'Pascabayar' : customer.subscriptionType ? 'Prabayar' : '-'}{customer.connectionType ? ` · ${customer.connectionType}` : ''}</Row>
                <Row label="Aktif s/d">{fmtDate(customer.expiredAt)}</Row>
                {customer.installDate !== undefined && <Row label="Tanggal pasang">{fmtDate(customer.installDate)}</Row>}
                {customer.phone && <Row label="Telepon">{customer.phone}</Row>}
                {customer.email && <Row label="Email">{customer.email}</Row>}
              </dl>
            </section>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
