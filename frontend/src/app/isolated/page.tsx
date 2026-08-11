'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  Clock,
  CreditCard,
  Phone,
  Mail,
  RefreshCw,
  User,
  Shield,
  Calendar,
  DollarSign,
  ExternalLink,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Wifi,
  X,
  FileText,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { formatWIB } from '@/lib/timezone';

interface CompanyInfo {
  name: string;
  phone: string;
  email: string;
  logo: string;
  isolationMessage: string;
}

interface UserInfo {
  username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  customerId: string | null;
  area: string | null;
  expiredAt: string;
  profileName: string | undefined;
  profilePrice: number | null;
  unpaidInvoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink: string | null;
  }>;
}

interface Gateway {
  provider: string;
  name: string;
}

// ─── PG metadata ──────────────────────────────────────────────────────────────

const PG_META: Record<string, { label: string; color: string; border: string; tag: string }> = {
  midtrans: { label: 'Midtrans', color: 'from-[#003d71] to-[#0066cc]', border: 'border-[#0066cc]/50', tag: 'VA / QRIS / Gopay' },
  xendit:   { label: 'Xendit',   color: 'from-[#0d47a1] to-[#1565c0]', border: 'border-[#1565c0]/50', tag: 'VA / QRIS / OVO' },
  duitku:   { label: 'Duitku',   color: 'from-[#1b5e20] to-[#2e7d32]', border: 'border-[#2e7d32]/50', tag: 'VA / QRIS' },
  tripay:   { label: 'Tripay',   color: 'from-[#4a148c] to-[#6a1b9a]', border: 'border-[#6a1b9a]/50', tag: 'VA / QRIS / Alfamart' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtDate = (s: string) => formatWIB(s, 'd MMMM yyyy');

function IsolatedContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('username');
  const ip = searchParams.get('ip');

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  // true = user isolation has been lifted (payment processed)
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [gateways,      setGateways]      = useState<Gateway[]>([]);
  // per-invoice state
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [payingState,   setPayingState]   = useState<Record<string, boolean>>({});
  const [paidNotice,    setPaidNotice]    = useState<Record<string, string | null>>({});
  const [showSteps,     setShowSteps]     = useState(false);
  const [showAllInfo,   setShowAllInfo]   = useState(false);

  // ── fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const companyRes  = await fetch('/api/company/info');
      const companyData = await companyRes.json();
      if (companyData.success) setCompany(companyData.data);

      if (username || ip) {
        const params = new URLSearchParams();
        if (username) params.set('username', username);
        if (ip)       params.set('ip', ip);
        const userRes  = await fetch(`/api/pppoe/users/check-isolation?${params.toString()}`);
        const userData = await userRes.json();
        if (userData.success) {
          if (userData.isolated === false) {
            setAlreadyActive(true);
            setTimeout(() => { window.location.href = '/'; }, 3000);
            return;
          }
          if (userData.data)                     setUserInfo(userData.data);
          if (userData.availableGateways?.length) setGateways(userData.availableGateways);
        }
      }
    } catch (err) {
      console.error('Failed to fetch isolation data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [username, ip]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── auto-poll every 30 s ───────────────────────────────────────────────────
  useEffect(() => {
    if (alreadyActive) return;
    const interval = setInterval(async () => {
      if (!username && !ip) return;
      try {
        const params = new URLSearchParams();
        if (username) params.set('username', username);
        if (ip)       params.set('ip', ip);
        const res  = await fetch(`/api/pppoe/users/check-isolation?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.isolated === false) {
          setAlreadyActive(true);
          setTimeout(() => { window.location.href = '/'; }, 3000);
          clearInterval(interval);
          return;
        }
        if (data.success && data.data) setUserInfo(data.data);
      } catch (_) { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [username, ip, alreadyActive]);

  // ── pay handler ─────────────────────────────────────────────────────────────
  const handlePay = async (invoice: { id: string; invoiceNumber: string }, provider: string) => {
    const key = `${invoice.id}:${provider}`;
    setPayingState(prev => ({ ...prev, [key]: true }));
    try {
      const res  = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, gateway: provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        setPaidNotice(prev => ({ ...prev, [invoice.id]: `Gagal: ${data.error || 'Coba lagi'}` }));
        return;
      }
      window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
      const label = PG_META[provider]?.label ?? provider;
      setPaidNotice(prev => ({
        ...prev,
        [invoice.id]: `✓ Halaman ${label} dibuka di tab baru. Halaman ini otomatis aktif setelah pembayaran dikonfirmasi.`,
      }));
      setOpenInvoiceId(null);
    } catch {
      setPaidNotice(prev => ({ ...prev, [invoice.id]: 'Gagal terhubung ke server.' }));
    } finally {
      setPayingState(prev => ({ ...prev, [key]: false }));
    }
  };

  /* ─── loading ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
        <div className="text-center">
          <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>Memuat data...</p>
          <p style={{ color: '#64748b', fontSize: 13 }}>Harap tunggu sebentar</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  /* ─── isolation lifted ─────────────────────────────────────────────────────── */
  if (alreadyActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f2818 0%, #064e3b 100%)' }}>
        <div className="text-center max-w-sm w-full">
          {company?.logo && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, marginBottom: 24, overflow: 'hidden' }}>
              <Image unoptimized src={company.logo} alt={company.name} width={220} height={110} style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle className="w-10 h-10" style={{ color: '#10b981' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#10b981', marginBottom: 8 }}>Layanan Aktif!</h1>
          <p style={{ color: '#a7f3d0', marginBottom: 6, fontSize: 14 }}>Isolasi telah dicabut.</p>
          <p style={{ color: '#6ee7b7', fontSize: 13, marginBottom: 24 }}>Mengalihkan ke halaman utama dalam 3 detik...</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '10px 18px' }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#10b981' }} />
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>Mengalihkan...</span>
          </div>
        </div>
      </div>
    );
  }

  /* ─── main page ────────────────────────────────────────────────────────────── */
  // Build user info rows — primary (always shown) and secondary (show more)
  const primaryInfoItems = userInfo ? ([
    { label: 'Username',     value: userInfo.username,              mono: true },
    { label: 'Nama',         value: userInfo.name                              },
    userInfo.profileName  ? { label: 'Paket',       value: userInfo.profileName                } : null,
    { label: 'Expired',      value: fmtDate(userInfo.expiredAt),    warn: true },
    { label: 'Telepon',      value: userInfo.phone || '—'                     },
  ] as Array<{ label: string; value: string; mono?: boolean; warn?: boolean; full?: boolean } | null>).filter(Boolean) : [];

  const secondaryInfoItems = userInfo ? ([
    userInfo.profilePrice ? { label: 'Harga Paket', value: fmtCurrency(userInfo.profilePrice) } : null,
    userInfo.email        ? { label: 'Email',        value: userInfo.email                     } : null,
    userInfo.area         ? { label: 'Area',          value: userInfo.area                      } : null,
    userInfo.customerId   ? { label: 'Customer ID',   value: userInfo.customerId, mono: true    } : null,
    userInfo.address      ? { label: 'Alamat',        value: userInfo.address,    full: true    } : null,
  ] as Array<{ label: string; value: string; mono?: boolean; warn?: boolean; full?: boolean } | null>).filter(Boolean) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%)' }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '10px 12px 20px' }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
          {company?.logo ? (
            <div style={{ background: '#fff', borderRadius: 10, padding: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, boxShadow: '0 2px 10px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <Image unoptimized src={company.logo} alt={company?.name || 'Logo'} width={220} height={110} style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wifi className="w-5 h-5" style={{ color: '#f87171' }} />
            </div>
          )}
          {company?.name && (
            <p style={{ color: '#64748b', fontSize: 12, fontWeight: 500, margin: 0 }}>{company.name}</p>
          )}
        </div>

        {/* ── Warning Banner ────────────────────────────────────────────────── */}
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', border: '1.5px solid rgba(239,68,68,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield className="w-5 h-5" style={{ color: '#f87171' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2 }}>Akun Anda Diisolir</p>
            <p style={{ fontSize: 11, color: '#fca5a5', margin: 0, marginTop: 1, lineHeight: 1.4 }}>
              {company?.isolationMessage || 'Masa berlangganan habis. Lakukan pembayaran untuk mengaktifkan kembali.'}
            </p>
          </div>
        </div>

        {/* ── User Info ────────────────────────────────────────────────────── */}
        {userInfo && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User className="w-3.5 h-3.5" style={{ color: '#818cf8' }} />
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 12 }}>Informasi Akun</span>
              </div>
              {secondaryInfoItems.length > 0 && (
                <button onClick={() => setShowAllInfo(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: 0, fontWeight: 600 }}>
                  {showAllInfo ? <><ChevronUp className="w-3 h-3" /> Sembunyikan</> : <><ChevronDown className="w-3 h-3" /> Selengkapnya</>}
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([...primaryInfoItems, ...(showAllInfo ? secondaryInfoItems : [])] as Array<{ label: string; value: string; mono?: boolean; warn?: boolean; full?: boolean } | null>)
                .filter(Boolean)
                .map(item => item && (
                  <div key={item.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '7px 10px', gridColumn: item.full ? 'span 2' : undefined }}>
                    <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', marginBottom: 2 }}>{item.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: item.warn ? '#fbbf24' : '#f1f5f9', fontFamily: item.mono ? 'monospace' : undefined, margin: 0, wordBreak: 'break-word' }}>{item.value}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Unpaid Invoices ───────────────────────────────────────────────── */}
        {userInfo && userInfo.unpaidInvoices.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText className="w-3.5 h-3.5" style={{ color: '#fb923c' }} />
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 12 }}>Tagihan Belum Dibayar</span>
              </div>
              <span style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
                {userInfo.unpaidInvoices.length} tagihan
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {userInfo.unpaidInvoices.map((invoice) => {
                const isOpen    = openInvoiceId === invoice.id;
                const notice    = paidNotice[invoice.id];
                const anyPaying = Object.values(payingState).some(Boolean);

                return (
                  <div key={invoice.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 12px' }}>
                      {/* Invoice number + amount row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div>
                          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', margin: '0 0 2px' }}>No. Invoice</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace', margin: 0 }}>{invoice.invoiceNumber}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', margin: '0 0 2px' }}>Total Tagihan</p>
                          <p style={{ fontSize: 20, fontWeight: 800, color: '#f87171', margin: 0, lineHeight: 1.1 }}>{fmtCurrency(invoice.amount)}</p>
                        </div>
                      </div>

                      {/* Due date inline */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: '5px 10px', marginBottom: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 11 }}>
                          <Calendar className="w-3 h-3" /> Jatuh Tempo
                        </span>
                        <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>{fmtDate(invoice.dueDate)}</span>
                      </div>

                      {/* Notice */}
                      {notice && (
                        <div style={{ marginBottom: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#10b981', marginTop: 1 }} />
                          <p style={{ color: '#a7f3d0', fontSize: 11, flex: 1, lineHeight: 1.5, margin: 0 }}>{notice}</p>
                          <button onClick={() => setPaidNotice(prev => ({ ...prev, [invoice.id]: null }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex' }}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Pay button */}
                      <button
                        onClick={() => setOpenInvoiceId(isOpen ? null : invoice.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', background: isOpen ? 'rgba(99,102,241,0.2)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)', color: isOpen ? '#a5b4fc' : '#ffffff', fontWeight: 700, padding: '11px 14px', borderRadius: 10, border: isOpen ? '1px solid rgba(99,102,241,0.4)' : 'none', cursor: 'pointer', fontSize: 13, transition: 'all .2s' }}
                      >
                        {isOpen ? (
                          <><ChevronUp className="w-4 h-4" /> Tutup Pilihan Pembayaran</>
                        ) : (
                          <><DollarSign className="w-4 h-4" /> Bayar Sekarang <ArrowRight className="w-4 h-4" style={{ marginLeft: 'auto' }} /></>
                        )}
                      </button>
                    </div>

                    {/* PG Accordion */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)', padding: '12px 12px' }}>
                        {gateways.length === 0 ? (
                          <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', margin: 0 }}>Tidak ada metode pembayaran aktif. Hubungi CS.</p>
                        ) : (
                          <>
                            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <CreditCard className="w-3 h-3" style={{ color: '#6366f1' }} /> Pilih metode pembayaran:
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              {gateways.map((gw) => {
                                const PG_BG: Record<string, string> = {
                                  midtrans: 'linear-gradient(135deg, #003d71, #0369a1)',
                                  xendit:   'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
                                  duitku:   'linear-gradient(135deg, #14532d, #15803d)',
                                  tripay:   'linear-gradient(135deg, #4c1d95, #7c3aed)',
                                };
                                const meta     = PG_META[gw.provider] ?? { label: gw.name, tag: '' };
                                const payKey   = `${invoice.id}:${gw.provider}`;
                                const isPaying = payingState[payKey] ?? false;

                                return (
                                  <button
                                    key={gw.provider}
                                    disabled={isPaying || anyPaying}
                                    onClick={() => handlePay(invoice, gw.provider)}
                                    style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: PG_BG[gw.provider] ?? '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 8px', cursor: isPaying || anyPaying ? 'not-allowed' : 'pointer', opacity: isPaying || anyPaying ? 0.5 : 1, transition: 'transform .15s, opacity .15s' }}
                                    onMouseEnter={e => { if (!isPaying && !anyPaying) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                  >
                                    {isPaying
                                      ? <Loader2 className="w-4 h-4 animate-spin text-white" />
                                      : <CreditCard className="w-4 h-4 text-white" style={{ opacity: 0.85 }} />}
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{meta.label || gw.name}</span>
                                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.3 }}>{meta.tag}</span>
                                    <ExternalLink style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, color: 'rgba(255,255,255,0.3)' }} />
                                  </button>
                                );
                              })}
                            </div>
                            <p style={{ fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 8 }}>Pembayaran dibuka di tab baru</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── No invoices ───────────────────────────────────────────────────── */}
        {userInfo && userInfo.unpaidInvoices.length === 0 && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', marginBottom: 8 }}>
            <CreditCard className="w-6 h-6 mx-auto mb-2" style={{ color: '#475569' }} />
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Tidak ada tagihan ditemukan.</p>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Hubungi customer service.</p>
          </div>
        )}

        {/* ── Steps (collapsible) ───────────────────────────────────────────── */}
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
          <button
            onClick={() => setShowSteps(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#818cf8' }} />
              <span style={{ fontWeight: 700, color: '#a5b4fc', fontSize: 12 }}>Cara mengaktifkan kembali</span>
            </div>
            {showSteps ? <ChevronUp className="w-3.5 h-3.5" style={{ color: '#6366f1' }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: '#6366f1' }} />}
          </button>
          {showSteps && (
            <ol style={{ listStyle: 'none', padding: '0 12px 10px', margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                'Klik "Bayar Sekarang" pada tagihan di atas',
                'Pilih metode pembayaran yang diinginkan',
                'Selesaikan pembayaran di halaman yang terbuka di tab baru',
                'Layanan aktif otomatis 1–2 menit setelah dikonfirmasi',
                'Logout & login ulang PPPoE untuk akses penuh',
              ].map((step, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 18, height: 18, minWidth: 18, background: 'rgba(99,102,241,0.25)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', fontWeight: 800, fontSize: 9 }}>{i + 1}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12, paddingTop: 2, lineHeight: 1.4 }}>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Footer row: contact + clock ───────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {company?.phone && (
              <a
                href={`https://wa.me/${company.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', fontWeight: 600, padding: '5px 10px', borderRadius: 8, textDecoration: 'none', fontSize: 11 }}
              >
                <Phone className="w-3 h-3" /> WA CS
              </a>
            )}
            {company?.email && (
              <a
                href={`mailto:${company.email}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 600, padding: '5px 10px', borderRadius: 8, textDecoration: 'none', fontSize: 11 }}
              >
                <Mail className="w-3 h-3" /> Email
              </a>
            )}
          </div>
          <p style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#334155', fontSize: 10, margin: 0 }}>
            <Clock className="w-3 h-3" /> Auto-refresh 30s
          </p>
        </div>
      </div>
    </div>
  );
}

export default function IsolatedPage() {
  return (
    <Suspense fallback={
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#e2e8f0', fontWeight: 600 }}>Memuat...</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <IsolatedContent />
    </Suspense>
  );
}
