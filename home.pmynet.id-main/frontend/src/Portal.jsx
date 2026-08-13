import React, { useState, useEffect, useRef, useCallback } from 'react'
import { monthLabel } from './utils/format'

// ─── CSS vars helpers ─────────────────────────────────────────────────────────
// We use CSS vars from index.css (same as admin). All colors reference those vars.
const v = (x) => `var(${x})`

// ─── Image compression ────────────────────────────────────────────────────────
const compressImage = (file, maxPx = 1200, quality = 0.80) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = reject
  reader.onload = ev => {
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
const apiCall = (path, opts = {}) => {
  const token = localStorage.getItem('portal_token')
  return fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  })
}

const fmt = (n) => 'Rp\u00a0' + Number(n || 0).toLocaleString('id-ID')
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const fmtBytes = (bytes) => {
  const b = Number(bytes || 0)
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'
  if (b >= 1024) return (b / 1024).toFixed(0) + ' KB'
  return b + ' B'
}
const fmtDuration = (sec) => {
  const s = Number(sec || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

// ─── Print Invoice ────────────────────────────────────────────────────────────
const printInvoice = (inv, customer) => {
  const w = window.open('', '_blank', 'width=800,height=700')
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${String(inv.id).padStart(5, '0')}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;color:#0f172a;background:#fff;padding:2.5rem}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:2px solid #e5e7eb}
    .logo{font-size:1.5rem;font-weight:800;color:#2563eb;letter-spacing:-0.02em}
    .logo span{color:#0f172a}
    .badge{display:inline-block;background:#d1fae5;color:#065f46;padding:4px 14px;border-radius:99px;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;margin-top:0.5rem}
    h2{font-size:1rem;font-weight:700;color:#0f172a;margin-bottom:1.25rem;text-transform:uppercase;letter-spacing:0.04em}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:2.5rem}
    .label{font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;font-weight:600}
    .val{font-size:0.9rem;font-weight:500;color:#0f172a}
    table{width:100%;border-collapse:collapse;margin-bottom:2rem}
    th{background:#f8fafc;text-align:left;padding:0.75rem 1rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:600;border-bottom:1px solid #e5e7eb}
    td{padding:0.875rem 1rem;border-bottom:1px solid #f1f5f9;font-size:0.9rem}
    .total{background:#f0f9ff;border-radius:12px;padding:1.25rem 1.5rem;display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem}
    .total-label{font-size:0.875rem;color:#0284c7;font-weight:600}
    .total-val{font-size:1.5rem;font-weight:800;color:#0284c7}
    .footer{text-align:center;color:#94a3b8;font-size:0.78rem;margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e5e7eb}
    .paid-stamp{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);font-size:5rem;font-weight:900;color:rgba(16,185,129,0.12);letter-spacing:0.1em;pointer-events:none;z-index:0;white-space:nowrap}
    @media print{body{padding:1.5rem}.paid-stamp{color:rgba(16,185,129,0.1)}}
  </style>
</head>
<body>
  <div class="paid-stamp">LUNAS</div>
  <div style="position:relative;z-index:1">
    <div class="header">
      <div>
        <div class="logo">PMY<span>NET</span></div>
        <div style="color:#64748b;font-size:0.8rem;margin-top:4px">Internet Service Provider</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.1rem;font-weight:700;color:#0f172a">INVOICE</div>
        <div style="color:#64748b;font-size:0.875rem">#${String(inv.id).padStart(5, '0')}</div>
        <div class="badge">&#10003; LUNAS</div>
      </div>
    </div>
    <div class="grid">
      <div>
        <h2>Tagihan Kepada</h2>
        <div class="label">Nama</div><div class="val">${customer.fullname || customer.username}</div>
        <div style="margin-top:0.75rem"><div class="label">ID Pelanggan</div><div class="val">${customer.customer_id || customer.username}</div></div>
        <div style="margin-top:0.75rem"><div class="label">Nomor HP</div><div class="val">${customer.phone || '-'}</div></div>
        <div style="margin-top:0.75rem"><div class="label">Alamat</div><div class="val">${customer.address || '-'}</div></div>
      </div>
      <div>
        <h2>Detail Invoice</h2>
        <div class="label">Nomor Invoice</div><div class="val">#INV-${String(inv.id).padStart(5, '0')}</div>
        <div style="margin-top:0.75rem"><div class="label">Periode</div><div class="val">${monthLabel(inv.period)}</div></div>
        <div style="margin-top:0.75rem"><div class="label">Tanggal Bayar</div><div class="val">${fmtDate(inv.paid_at)}</div></div>
        <div style="margin-top:0.75rem"><div class="label">Metode Bayar</div><div class="val">${inv.payment_method || 'Transfer/Cash'}</div></div>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Deskripsi</th><th>Paket</th><th style="text-align:right">Jumlah</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Layanan Internet Bulanan<br><span style="font-size:0.78rem;color:#64748b">Periode ${monthLabel(inv.period)}</span></td>
          <td>${customer.package_name || '-'}</td>
          <td style="text-align:right;font-weight:600">${inv.discount > 0 ? fmt(Number(inv.amount) + Number(inv.discount)) : fmt(inv.amount)}</td>
        </tr>
        ${inv.discount > 0 ? `<tr>
          <td style="color:#b45309;font-weight:600">🏷️ Diskon${customer.discount_note ? `<br><span style="font-size:0.78rem;font-weight:400;color:#92400e">${customer.discount_note}</span>` : ''}</td>
          <td></td>
          <td style="text-align:right;font-weight:600;color:#b45309">- ${fmt(inv.discount)}</td>
        </tr>` : ''}
      </tbody>
    </table>
    <div class="total">
      <div class="total-label">Total Dibayar</div>
      <div class="total-val">${fmt(inv.amount)}</div>
    </div>
    <div class="footer">
      Terima kasih atas kepercayaan Anda menggunakan layanan PMY NET.<br>
      Invoice ini diterbitkan secara elektronik dan sah tanpa tanda tangan.
    </div>
  </div>
  <script>window.onload=function(){window.print();}<\/script>
</body>
</html>`
  w.document.write(html)
  w.document.close()
}

// ─── Tiny SVG Icons ───────────────────────────────────────────────────────────
const Ico = ({ d, size = 20, color = 'currentColor', sw = 2, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const IUser = (p) => <Ico {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
const IWifi = (p) => <Ico {...p} d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
const ICheck = (p) => <Ico {...p} d="M20 6 9 17l-5-5" />
const IPhone = (p) => <Ico {...p} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.05 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
const IFileText = (p) => <Ico {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
const IUpload = (p) => <Ico {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
const ILogOut = (p) => <Ico {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
const IAlert = (p) => <Ico {...p} d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
const ICreditCard = (p) => <Ico {...p} d="M1 4h22v16H1zM1 10h22" />
const IX = (p) => <Ico {...p} d="M18 6 6 18M6 6l12 12" />
const IHistory = (p) => <Ico {...p} d="M12 8v4l3 3M3.05 11a9 9 0 1 0 .5-3H1" />
const IPrint = (p) => <Ico {...p} d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
const ISun = (p) => <Ico {...p} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
const IBell = (p) => <Ico {...p} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
const IMoon = (p) => <Ico {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
const IChevronDown = (p) => <Ico {...p} d="M6 9l6 6 6-6" />
const IMapPin = (p) => <Ico {...p} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
const ICalendar = (p) => <Ico {...p} d="M3 9h18M3 4h18v18H3zM8 4V2M16 4V2" />
const IExternalLink = (p) => <Ico {...p} d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
const IArrowUp = (p) => <Ico {...p} d="M12 19V5M5 12l7-7 7 7" />
const IArrowDown = (p) => <Ico {...p} d="M12 5v14M19 12l-7 7-7-7" />
const IServer = (p) => <Ico {...p} d="M2 8h20v8H2zM6 12h.01M10 12h.01M2 4h20v4H2zM2 16h20v4H2zM6 6h.01M10 6h.01M6 18h.01M10 18h.01" />
const IBank = (p) => <Ico {...p} d="M2 11h20M12 2 2 7h20L12 2zM4 11v8M8 11v8M12 11v8M16 11v8M20 11v8M2 19h20" />
const ILock = (p) => <Ico {...p} d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />
const IEye = (p) => <Ico {...p} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
const IEyeOff = (p) => <Ico {...p} d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 0 1-4.24-4.24" />
const IShield = (p) => <Ico {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS = {
  paid: { bg: '#d1fae5', c: '#065f46', bdark: '#065f46', cdark: '#6ee7b7', label: 'LUNAS' },
  unpaid: { bg: '#fee2e2', c: '#991b1b', bdark: '#991b1b', cdark: '#fca5a5', label: 'BELUM BAYAR' },
  cancelled: { bg: '#f3f4f6', c: '#6b7280', bdark: '#374151', cdark: '#9ca3af', label: 'DIBATALKAN' },
  pending: { bg: '#fef3c7', c: '#92400e', bdark: '#78350f', cdark: '#fcd34d', label: 'MENUNGGU VERIF' },
  approved: { bg: '#d1fae5', c: '#065f46', bdark: '#065f46', cdark: '#6ee7b7', label: 'DISETUJUI' },
  rejected: { bg: '#fee2e2', c: '#991b1b', bdark: '#991b1b', cdark: '#fca5a5', label: 'DITOLAK' },
}

function StatusBadge({ status, isDark }) {
  const s = STATUS[status] || STATUS.unpaid
  return (
    <span style={{
      background: isDark ? s.bdark + '33' : s.bg,
      color: isDark ? s.cdark : s.c,
      padding: '3px 10px', borderRadius: '99px', fontSize: '0.7rem',
      fontWeight: '700', letterSpacing: '0.04em', whiteSpace: 'nowrap',
      border: `1px solid ${isDark ? s.cdark + '44' : s.c + '22'}`
    }}>
      {s.label}
    </span>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t) }, [onClose])
  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '12px',
      background: bg, color: '#fff', padding: '0.85rem 1.25rem',
      borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      maxWidth: '360px', fontSize: '0.875rem', fontWeight: '500',
      animation: 'slideInRight 0.3s ease'
    }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}>
        <IX size={16} />
      </button>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: v('--text-muted') }}>
      <div style={{
        width: '36px', height: '36px', margin: '0 auto 1rem',
        border: `3px solid ${v('--border-color')}`,
        borderTopColor: v('--primary-color'),
        borderRadius: '50%', animation: '_spin 0.75s linear infinite'
      }} />
      <p style={{ margin: 0, fontSize: '0.875rem' }}>Memuat data...</p>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionTitle({ icon, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05rem', fontWeight: '700', color: v('--text-main'), margin: 0 }}>
        <span style={{ color: v('--primary-color') }}>{icon}</span>
        {children}
      </h2>
      {right}
    </div>
  )
}

// ─── Info Card ────────────────────────────────────────────────────────────────
function InfoCard({ icon, label, value, sub }) {
  return (
    <div style={{
      background: v('--bg-secondary'), borderRadius: '12px',
      padding: '1rem 1.25rem', border: `1px solid ${v('--border-color')}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
        <span style={{ color: v('--primary-color') }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: '600', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontWeight: '700', fontSize: '1rem', color: v('--text-main') }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: v('--text-muted'), marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px', fontWeight: '600' }}>{label}</div>
      <div style={{ fontWeight: '500', color: v('--text-main'), fontSize: '0.875rem', wordBreak: 'break-all' }}>{value || '-'}</div>
    </div>
  )
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, icon, style: extraStyle = {} }) {
  const baseStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: '600', fontFamily: 'inherit', transition: 'all 0.15s',
    opacity: disabled ? 0.6 : 1,
    padding: size === 'sm' ? '0.35rem 0.75rem' : size === 'lg' ? '0.875rem 1.5rem' : '0.55rem 1rem',
    fontSize: size === 'sm' ? '0.78rem' : size === 'lg' ? '1rem' : '0.875rem',
  }
  const variants = {
    primary: { background: v('--primary-color'), color: '#fff' },
    success: { background: '#10b981', color: '#fff' },
    danger: { background: '#ef4444', color: '#fff' },
    outline: { background: 'transparent', color: v('--text-main'), border: `1px solid ${v('--border-color')}` },
    ghost: { background: 'transparent', color: v('--text-muted'), border: 'none' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...baseStyle, ...variants[variant], ...extraStyle }}>
      {icon && <span>{icon}</span>}
      {children}
    </button>
  )
}

// ─── Upload Proof Modal ───────────────────────────────────────────────────────
function ProofModal({ inv, onClose, onSuccess, isDark, gateways = {} }) {
  const [form, setForm] = useState({ bank_name: '', transfer_date: '', notes: '', image_base64: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const imgRef = useRef()

  const handleImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('Ukuran file maksimal 10MB'); return }
    try {
      const compressed = await compressImage(file, 1200, 0.80)
      setForm(f => ({ ...f, image_base64: compressed }))
    } catch {
      const reader = new FileReader()
      reader.onload = (ev) => setForm(f => ({ ...f, image_base64: ev.target.result }))
      reader.readAsDataURL(file)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.image_base64) { setError('Upload foto bukti transfer terlebih dahulu'); return }
    if (!form.bank_name) { setError('Pilih bank asal transfer'); return }
    setLoading(true); setError('')
    try {
      const r = await apiCall('/portal/payment/proof', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: inv.id, ...form, amount: inv.amount })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onSuccess(d.message || 'Bukti berhasil diupload!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Build bank accounts list from gateways config
  const banks = []
  if (gateways.transfer_bank_name && gateways.transfer_account_number) {
    banks.push({
      name: gateways.transfer_bank_name,
      number: gateways.transfer_account_number,
      holder: gateways.transfer_account_name || '',
    })
  }
  if (gateways.transfer_bank_2_name && gateways.transfer_bank_2_number) {
    banks.push({
      name: gateways.transfer_bank_2_name,
      number: gateways.transfer_bank_2_number,
      holder: gateways.transfer_bank_2_account || '',
    })
  }

  return (
    <BottomSheet onClose={onClose} title="Upload Bukti Transfer">
      <div style={{ background: v('--bg-secondary'), borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: '700', color: v('--text-main') }}>Invoice #{String(inv.id).padStart(5, '0')}</div>
        <div style={{ color: v('--text-muted'), fontSize: '0.82rem', marginTop: '2px' }}>
          Periode {monthLabel(inv.period)} · <strong style={{ color: v('--text-main') }}>{fmt(inv.amount)}</strong>
        </div>
      </div>

      {/* ── Bank account info ── */}
      {banks.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.625rem' }}>
            <IBank size={15} color={v('--primary-color')} />
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rekening Tujuan Transfer
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {banks.map((b, i) => (
              <div key={i} style={{
                background: isDark ? 'rgba(37,99,235,0.12)' : '#eff6ff',
                border: `1px solid ${isDark ? 'rgba(37,99,235,0.3)' : '#bfdbfe'}`,
                borderRadius: '10px', padding: '0.875rem 1rem',
                display: 'flex', alignItems: 'center', gap: '0.875rem'
              }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '8px',
                  background: isDark ? '#1e3a5f' : '#dbeafe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <IBank size={18} color={v('--primary-color')} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', color: v('--text-main'), fontSize: '0.9rem' }}>{b.name}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: '700', color: v('--primary-color'), letterSpacing: '0.08em', marginTop: '1px' }}>
                    {b.number}
                  </div>
                  {b.holder && <div style={{ fontSize: '0.78rem', color: v('--text-muted'), marginTop: '1px' }}>a/n {b.holder}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(b.number); }}
                  title="Salin nomor rekening"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: v('--text-muted'), flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: v('--text-muted'), lineHeight: 1.5 }}>
            Transfer tepat <strong>{fmt(inv.amount)}</strong> lalu upload bukti di bawah ini.
          </p>
        </div>
      )}

      <form onSubmit={submit}>
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <IAlert size={16} color="#991b1b" />{error}
          </div>
        )}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Bank / Dompet Digital *</label>
          <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} required style={inputStyle(isDark)}>
            <option value="">-- Pilih Bank --</option>
            {['BCA', 'BNI', 'BRI', 'Mandiri', 'CIMB Niaga', 'BSI', 'Permata', 'BTN', 'OVO', 'GoPay', 'DANA', 'ShopeePay', 'LinkAja', 'Lainnya'].map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Tanggal Transfer</label>
          <input type="date" value={form.transfer_date} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))} style={inputStyle(isDark)} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Catatan (opsional)</label>
          <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Misal: Transfer dari rekening BCA 12345..." style={inputStyle(isDark)} />
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Foto Bukti Transfer *</label>
          <div
            onClick={() => imgRef.current?.click()}
            style={{
              border: `2px dashed ${form.image_base64 ? '#10b981' : v('--border-color')}`,
              borderRadius: '12px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
              background: form.image_base64 ? 'rgba(16,185,129,0.05)' : v('--bg-secondary'), transition: 'all 0.2s'
            }}>
            {form.image_base64 ? (
              <div>
                <img src={form.image_base64} alt="preview" style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain' }} />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#10b981', fontWeight: '600' }}>Foto dipilih. Ketuk untuk ganti.</p>
              </div>
            ) : (
              <div>
                <IUpload size={28} color={v('--text-muted')} />
                <p style={{ margin: '0.5rem 0 2px', fontSize: '0.875rem', color: v('--text-muted') }}>Ketuk untuk pilih foto</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: v('--text-muted'), opacity: 0.7 }}>JPG, PNG – maks. 5MB</p>
              </div>
            )}
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImage} />
        </div>
        <Btn variant="success" size="lg" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Mengupload...' : 'Kirim Bukti Transfer'}
        </Btn>
      </form>
    </BottomSheet>
  )
}

// ─── Payment Gateway Modal ────────────────────────────────────────────────────
function PGModal({ inv, gateways, onClose, onError }) {
  const [loading, setLoading] = useState(false)

  const GW_LABELS = { midtrans: 'Midtrans', xendit: 'Xendit', duitku: 'Duitku', tripay: 'Tripay' }
  const GW_ICONS = { midtrans: '💳', xendit: '⚡', duitku: '🏦', tripay: '🔗' }

  const handlePay = async (key) => {
    setLoading(key)
    try {
      const r = await apiCall('/portal/payment/gateway', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: inv.id, gateway: key })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Gagal membuat link pembayaran')
      // Coba buka tab baru. Jika diblokir, navigasi di tab yang sama
      // tapi simpan origin dulu agar PG bisa redirect balik ke portal
      const pgWindow = window.open(d.paymentUrl, '_blank')
      if (pgWindow) {
        pgWindow.focus()
        onClose()
      } else {
        // Popup diblokir — navigasi same tab, PG callback akan bawa balik ke /portal
        window.location.href = d.paymentUrl
      }
    } catch (e) { onError(e.message) }
    finally { setLoading(false) }
  }

  const active = Object.entries(GW_LABELS).filter(([k]) => gateways['pg_' + k + '_active'] === '1')

  return (
    <BottomSheet onClose={onClose} title="Pilih Metode Pembayaran">
      <div style={{ background: v('--bg-secondary'), borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: '700', color: v('--text-main') }}>Invoice #{String(inv.id).padStart(5, '0')}</div>
        <div style={{ color: v('--text-muted'), fontSize: '0.82rem', marginTop: '2px' }}>
          Periode {monthLabel(inv.period)} · <strong style={{ color: v('--text-main') }}>{fmt(inv.amount)}</strong>
        </div>
      </div>
      {active.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: v('--text-muted') }}>
          <IAlert size={36} color="#f59e0b" />
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>Belum ada pembayaran online aktif.<br />Gunakan Upload Bukti Transfer.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {active.map(([key, label]) => (
            <button key={key} onClick={() => handlePay(key)} disabled={!!loading}
              style={{
                padding: '1rem 1.25rem', borderRadius: '12px',
                border: `1.5px solid ${v('--border-color')}`,
                background: v('--bg-surface'), cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '1rem',
                fontWeight: '600', fontSize: '0.95rem', color: v('--text-main'),
                transition: 'all 0.15s', opacity: loading && loading !== key ? 0.5 : 1
              }}>
              <span style={{ fontSize: '1.5rem' }}>{GW_ICONS[key]}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              {loading === key
                ? <span style={{ fontSize: '0.78rem', color: v('--text-muted') }}>Memproses...</span>
                : <IExternalLink size={16} color={v('--text-muted')} />}
            </button>
          ))}
        </div>
      )}
      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.75rem', color: v('--text-muted'), lineHeight: 1.6 }}>
        Anda akan diarahkan ke halaman pembayaran yang aman.
      </p>
    </BottomSheet>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ onClose, title, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: v('--bg-surface'), borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: '640px', padding: '1.5rem',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.2)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: v('--text-main') }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: v('--text-muted'), padding: '4px' }}>
            <IX size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Change PIN Page ──────────────────────────────────────────────────────────
function ChangePinPage({ isDark, loading, onSubmit }) {
  const v = (x) => `var(${x})`
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const inputStyle = {
    width: '100%', padding: '0.75rem 0.875rem 0.75rem 2.75rem',
    border: `1.5px solid ${v('--border-color')}`,
    borderRadius: '10px', fontSize: '1rem', background: v('--bg-secondary'),
    color: v('--text-main'), outline: 'none', fontFamily: 'inherit', letterSpacing: '0.2em'
  }

  const pinInput = (value, setValue, show, setShow, placeholder) => (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: v('--text-muted') }}>
        <ILock size={16} />
      </div>
      <input
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={placeholder}
        required
        style={{ ...inputStyle, paddingRight: '2.75rem' }}
        onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
        onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
      />
      <button type="button" onClick={() => setShow(s => !s)} style={{
        position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', color: v('--text-muted'), padding: 0, lineHeight: 1
      }}>
        {show ? <IEyeOff size={16} /> : <IEye size={16} />}
      </button>
    </div>
  )

  const strength = newPin.length === 6
    ? (newPin === '123456' || newPin === '000000' || /^(.)\1{5}$/.test(newPin) ? 'lemah' : 'kuat')
    : null

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: isDark ? 'linear-gradient(135deg, #1e3a5f, #0f172a)' : 'linear-gradient(135deg, #1e40af, #0284c7)',
        borderRadius: '16px', padding: '1.5rem', color: '#fff', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem'
      }}>
        <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IShield size={24} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', fontFamily: 'Outfit, sans-serif', color: '#fff' }}>Keamanan Akun</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>Ubah PIN untuk melindungi akun portal Anda</p>
        </div>
      </div>

      {/* Form card */}
      <div style={{
        background: v('--bg-surface'), borderRadius: '16px', padding: '1.5rem',
        border: `1px solid ${v('--border-color')}`, boxShadow: v('--shadow-sm')
      }}>
        <form onSubmit={e => { e.preventDefault(); onSubmit({ oldPin, newPin, confirmPin }) }}>
          {/* PIN lama */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: v('--text-main'), marginBottom: '6px' }}>
              PIN Saat Ini
            </label>
            {pinInput(oldPin, setOldPin, showOld, setShowOld, '••••••')}
          </div>

          <div style={{ height: '1px', background: v('--border-color'), margin: '1.25rem 0' }} />

          {/* PIN baru */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: v('--text-main'), marginBottom: '6px' }}>
              PIN Baru <span style={{ fontWeight: '400', color: v('--text-muted') }}>(6 digit angka)</span>
            </label>
            {pinInput(newPin, setNewPin, showNew, setShowNew, '••••••')}
            {strength && (
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: strength === 'kuat' ? '#10b981' : '#f59e0b'
                }} />
                <span style={{ color: strength === 'kuat' ? '#10b981' : '#f59e0b', fontWeight: '600' }}>
                  PIN {strength}
                </span>
                {strength === 'lemah' && (
                  <span style={{ color: v('--text-muted') }}>— hindari PIN yang mudah ditebak</span>
                )}
              </div>
            )}
          </div>

          {/* Konfirmasi PIN baru */}
          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: v('--text-main'), marginBottom: '6px' }}>
              Konfirmasi PIN Baru
            </label>
            {pinInput(confirmPin, setConfirmPin, showNew, setShowNew, '••••••')}
            {confirmPin.length === 6 && (
              <div style={{ marginTop: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {newPin === confirmPin
                  ? <><ICheck size={13} color="#10b981" /><span style={{ color: '#10b981', fontWeight: '600' }}>PIN cocok</span></>
                  : <><IX size={13} color="#ef4444" /><span style={{ color: '#ef4444', fontWeight: '600' }}>PIN tidak cocok</span></>
                }
              </div>
            )}
          </div>

          <button type="submit" disabled={loading || newPin.length < 6 || newPin !== confirmPin || oldPin.length < 6} style={{
            width: '100%', padding: '0.875rem',
            background: (loading || newPin.length < 6 || newPin !== confirmPin || oldPin.length < 6)
              ? v('--text-muted')
              : 'linear-gradient(135deg, var(--primary-color), #22c55e)',
            color: '#fff', border: 'none', borderRadius: '10px',
            fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s'
          }}>
            {loading ? 'Menyimpan...' : 'Simpan PIN Baru'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', padding: '0.875rem', background: v('--bg-secondary'), borderRadius: '10px', fontSize: '0.78rem', color: v('--text-muted'), lineHeight: 1.6 }}>
          <strong style={{ color: v('--text-main') }}>Tips keamanan:</strong><br />
          Gunakan 6 digit angka yang tidak mudah ditebak. Jangan gunakan tanggal lahir atau PIN yang sama dengan rekening bank.
          Jika lupa PIN, hubungi admin untuk reset.
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Card ─────────────────────────────────────────────────────────────
function InvoiceCard({ inv, isDark, customer, onProof, onPG, onPrint, activeGateways = [], expanded, onToggle, banks = [] }) {
  const hasProofPending = inv.proof_status === 'pending'
  const hasProofRejected = inv.proof_status === 'rejected'
  const isPaid = inv.status === 'paid'
  const badgeStatus = hasProofPending ? 'pending' : hasProofRejected ? 'rejected' : inv.status

  return (
    <div style={{
      background: v('--bg-surface'), borderRadius: '16px',
      border: `1px solid ${v('--border-color')}`, marginBottom: '1rem',
      overflow: 'hidden', transition: 'box-shadow 0.2s',
      boxShadow: expanded ? `0 4px 24px rgba(0,0,0,0.12)` : 'none'
    }}>
      {/* Header row */}
      <div style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <div>
            <div style={{ fontWeight: '700', color: v('--text-main'), fontSize: '0.95rem' }}>
              Invoice #{String(inv.id).padStart(5, '0')}
            </div>
            <div style={{ fontSize: '0.8rem', color: v('--text-muted'), marginTop: '2px' }}>Periode {monthLabel(inv.period)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StatusBadge status={badgeStatus} isDark={isDark} />
            <span style={{ color: v('--text-muted'), transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>
              <IChevronDown size={16} />
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: v('--text-main') }}>{fmt(inv.amount)}</div>
          {isPaid && inv.paid_at && (
            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '600' }}>
              ✓ Dibayar {fmtDate(inv.paid_at)}
            </div>
          )}
          {hasProofPending && (
            <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: '600' }}>
              ⏳ Menunggu verifikasi admin
            </div>
          )}
          {hasProofRejected && (
            <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: '600' }}>
              ✕ Ditolak: {inv.reject_reason || 'Lihat detail'}
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${v('--border-color')}`, padding: '1.25rem', background: v('--bg-secondary') }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <DetailRow label="Metode Bayar" value={
              inv.payment_method === 'cash' ? 'Tunai' :
                inv.payment_method === 'transfer' ? 'Transfer Bank' :
                  inv.payment_method === 'gateway' ? 'Pembayaran Online' :
                    inv.payment_method || (isPaid ? 'Offline/Manual' : '-')
            } />
            <DetailRow label="Tanggal Bayar" value={fmtDateTime(inv.paid_at)} />
            <DetailRow label="Dibuat" value={fmtDate(inv.created_at)} />
            {isPaid && inv.paid_by_name && (
              <DetailRow
                label={inv.paid_by_role === 'collector' ? 'Diterima Oleh' : 'Diproses Oleh'}
                value={inv.paid_by_name}
              />
            )}
            {inv.proof_status && <DetailRow label="Status Bukti" value={inv.proof_status === 'pending' ? 'Menunggu Verifikasi' : inv.proof_status === 'approved' ? 'Disetujui' : 'Ditolak'} />}
            {inv.reject_reason && <DetailRow label="Alasan Tolak" value={inv.reject_reason} />}
          </div>

          {/* Instruksi Transfer — tampil kalau belum bayar & ada rekening tujuan */}
          {!isPaid && !hasProofPending && banks.length > 0 && (
            <div style={{
              background: isDark ? 'rgba(37,99,235,0.1)' : '#eff6ff',
              border: `1px solid ${isDark ? 'rgba(37,99,235,0.25)' : '#bfdbfe'}`,
              borderRadius: '12px', padding: '1rem', marginBottom: '1rem'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>
                📋 Cara Pembayaran Transfer
              </div>
              <div style={{ fontSize: '0.82rem', color: v('--text-muted'), marginBottom: '0.75rem', lineHeight: 1.5 }}>
                Transfer tagihan sebesar <strong style={{ color: v('--text-main') }}>{fmt(inv.amount)}</strong> ke rekening berikut:
              </div>
              {banks.map((b, i) => (
                <div key={i} style={{
                  background: v('--bg-surface'), borderRadius: '10px', padding: '0.75rem 1rem',
                  marginBottom: i < banks.length - 1 ? '0.5rem' : 0,
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  border: `1px solid ${v('--border-color')}`
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: v('--text-main') }}>{b.name}</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '1rem', color: '#2563eb', letterSpacing: '0.1em', margin: '1px 0' }}>{b.number}</div>
                    {b.holder && <div style={{ fontSize: '0.75rem', color: v('--text-muted') }}>a/n {b.holder}</div>}
                  </div>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(b.number) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: v('--text-muted'), flexShrink: 0 }}
                    title="Salin nomor rekening">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              ))}
              <div style={{ fontSize: '0.78rem', color: v('--text-muted'), marginTop: '0.625rem', lineHeight: 1.5 }}>
                Setelah transfer, klik <strong style={{ color: v('--text-main') }}>Upload Bukti</strong> di bawah dan lampirkan foto bukti transfernya.
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {isPaid && (
              <Btn variant="outline" size="sm" icon={<IPrint size={14} />} onClick={() => onPrint(inv)}>
                Print / PDF
              </Btn>
            )}
            {!isPaid && !hasProofPending && (
              <>
                {activeGateways.length > 0 && (
                  <Btn variant="primary" size="sm" icon={<ICreditCard size={14} />} onClick={() => onPG(inv)}>
                    Bayar Online
                  </Btn>
                )}
                <Btn variant="outline" size="sm" icon={<IUpload size={14} />} onClick={() => onProof(inv)}>
                  Upload Bukti
                </Btn>
              </>
            )}
            {hasProofRejected && (
              <Btn variant="outline" size="sm" icon={<IUpload size={14} />} onClick={() => onProof(inv)}>
                Upload Ulang
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared input styles ──────────────────────────────────────────────────────
const labelStyle = {
  display: 'block', marginBottom: '0.4rem',
  fontWeight: '600', color: 'var(--text-main)', fontSize: '0.875rem'
}
const inputStyle = (isDark) => ({
  width: '100%', padding: '0.7rem 0.875rem',
  border: `1.5px solid var(--border-color)`,
  borderRadius: '8px', fontSize: '0.9rem', outline: 'none',
  boxSizing: 'border-box',
  background: isDark ? 'var(--bg-secondary)' : '#fff',
  color: 'var(--text-main)',
  fontFamily: 'inherit'
})

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PORTAL APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function Portal() {
  // Theme
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('portal_theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('portal_theme', theme)
  }, [isDark])

  // App state
  const [page, setPage] = useState('login')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [customer, setCustomer] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [gateways, setGateways] = useState({})
  const [expandedInv, setExpandedInv] = useState(null)

  // Connection status
  const [connInfo, setConnInfo] = useState(null)
  const [connLoading, setConnLoading] = useState(false)
  const connTimerRef = useRef(null)
  const [activePromise, setActivePromise] = useState(null)

  // Modals
  const [showProofModal, setShowProofModal] = useState(false)
  const [showPGModal, setShowPGModal] = useState(false)
  const [selectedInv, setSelectedInv] = useState(null)

  // Notifications
  const [portalNotifs, setPortalNotifs] = useState([])
  const [portalUnread, setPortalUnread] = useState(0)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const notifPanelRef = useRef(null)

  const toast$ = (msg, type = 'success') => setToast({ msg, type })

  const loadGateways = useCallback(async () => {
    try {
      const r = await apiCall('/portal/config/gateways')
      if (r.ok) setGateways(await r.json())
    } catch (e) { }
  }, [])

  const fetchConnection = useCallback(async () => {
    setConnLoading(true)
    try {
      const r = await apiCall('/portal/connection')
      if (r.ok) setConnInfo(await r.json())
    } catch (e) { }
    finally { setConnLoading(false) }
  }, [])

  const fetchPromise = useCallback(async () => {
    try {
      const r = await apiCall('/portal/promise')
      if (r.ok) setActivePromise(await r.json())
    } catch (e) { }
  }, [])

  const fetchPortalNotifs = useCallback(async () => {
    try {
      const r = await apiCall('/portal/notifications')
      if (!r.ok) return
      const data = await r.json()
      setPortalNotifs(data.notifications || [])
      setPortalUnread(data.unread || 0)
    } catch (_) {}
  }, [])

  const markPortalNotifRead = async (id) => {
    setPortalNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    setPortalUnread(prev => Math.max(0, prev - 1))
    apiCall(`/portal/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
  }

  const markAllPortalRead = async () => {
    setPortalNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    setPortalUnread(0)
    apiCall('/portal/notifications/read-all', { method: 'POST' }).catch(() => {})
  }

  const urlBase64ToUint8Array = (b64) => {
    const padding = '='.repeat((4 - b64.length % 4) % 4)
    const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
  }

  const subscribePortalPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const keyRes = await fetch('/api/notifications/vapid-key')
      const { vapidPublicKey } = await keyRes.json()
      if (!vapidPublicKey) return
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
      const subJson = sub.toJSON()
      await apiCall('/portal/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }) })
    } catch (_) {}
  }

  // Notif panel close on outside click
  useEffect(() => {
    if (!showNotifPanel) return
    const handler = (e) => { if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) setShowNotifPanel(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifPanel])

  useEffect(() => {
    const tok = localStorage.getItem('portal_token')
    const cust = localStorage.getItem('portal_customer')
    if (tok && cust) {
      try { setCustomer(JSON.parse(cust)); setPage('dashboard'); loadGateways(); fetchConnection(); fetchPromise() }
      catch (e) { doLogout() }
    }
    // Check payment success redirect
    const p = new URLSearchParams(window.location.search)
    if (p.get('status') === 'success') {
      toast$('Pembayaran berhasil! Invoice akan diperbarui segera.')
      window.history.replaceState({}, '', '/portal')
    }
  }, [loadGateways, fetchConnection])

  // Auto-refresh connection status every 60s when on dashboard
  useEffect(() => {
    if (page === 'dashboard' && customer) {
      if (connTimerRef.current) clearInterval(connTimerRef.current)
      connTimerRef.current = setInterval(fetchConnection, 60000)
    } else {
      if (connTimerRef.current) { clearInterval(connTimerRef.current); connTimerRef.current = null }
    }
    return () => { if (connTimerRef.current) clearInterval(connTimerRef.current) }
  }, [page, customer, fetchConnection])

  // Fetch notifs & register SW saat login
  useEffect(() => {
    if (page !== 'dashboard' || !customer) return
    fetchPortalNotifs()
    const interval = setInterval(fetchPortalNotifs, 60000)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => subscribePortalPush()).catch(() => {})
    }
    return () => clearInterval(interval)
  }, [page, customer?.username])

  const doLogout = () => {
    localStorage.removeItem('portal_token')
    localStorage.removeItem('portal_customer')
    setCustomer(null); setInvoices([]); setPage('login')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!phone.trim()) return toast$('Masukkan nomor HP Anda', 'error')
    if (!pin.trim()) return toast$('Masukkan PIN Anda', 'error')
    setLoading(true)
    try {
      const r = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), pin: pin.trim() })
      })
      const data = await r.json()
      if (!r.ok) return toast$(data.error || 'Login gagal', 'error')
      localStorage.setItem('portal_token', data.token)
      localStorage.setItem('portal_customer', JSON.stringify(data.customer))
      setCustomer(data.customer)
      loadGateways()
      setPage('dashboard')
      setPin('')
      toast$('Selamat datang, ' + (data.customer.fullname || data.customer.username) + '!')
    } catch (err) { toast$('Koneksi gagal: ' + err.message, 'error') }
    finally { setLoading(false) }
  }

  const handleChangePin = async ({ oldPin, newPin, confirmPin }) => {
    if (newPin !== confirmPin) return toast$('Konfirmasi PIN tidak cocok', 'error')
    if (!/^\d{6}$/.test(newPin)) return toast$('PIN harus 6 digit angka', 'error')
    setLoading(true)
    try {
      const r = await apiCall('/portal/change-pin', {
        method: 'POST',
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin })
      })
      const data = await r.json()
      if (!r.ok) return toast$(data.error || 'Gagal mengubah PIN', 'error')
      // Update state customer agar banner PIN default langsung hilang
      const updatedCustomer = { ...customer, pin_is_default: 0 }
      setCustomer(updatedCustomer)
      localStorage.setItem('portal_customer', JSON.stringify(updatedCustomer))
      toast$('PIN berhasil diubah!')
      setPage('dashboard')
    } catch (err) { toast$('Koneksi gagal: ' + err.message, 'error') }
    finally { setLoading(false) }
  }

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiCall('/portal/invoices')
      if (r.ok) setInvoices(await r.json())
      else toast$('Gagal memuat tagihan', 'error')
    } catch (e) { toast$('Koneksi gagal', 'error') }
    finally { setLoading(false) }
  }, [])

  const goTo = (p) => {
    setPage(p)
    setExpandedInv(null)
    if (p === 'tagihan' || p === 'riwayat') fetchInvoices()
    if (p === 'dashboard') { fetchConnection(); fetchPromise() }
  }

  const openProof = (inv) => { setSelectedInv(inv); setShowProofModal(true) }
  const openPG = (inv) => { setSelectedInv(inv); setShowPGModal(true) }
  const handlePrint = (inv) => printInvoice(inv, customer)

  const activeGateways = Object.entries({ midtrans: 'Midtrans', xendit: 'Xendit', duitku: 'Duitku', tripay: 'Tripay' })
    .filter(([k]) => gateways['pg_' + k + '_active'] === '1')

  // Bank accounts untuk ditampilkan di InvoiceCard
  const bankAccounts = []
  if (gateways.transfer_bank_name && gateways.transfer_account_number) {
    bankAccounts.push({ name: gateways.transfer_bank_name, number: gateways.transfer_account_number, holder: gateways.transfer_account_name || '' })
  }
  if (gateways.transfer_bank_2_name && gateways.transfer_bank_2_number) {
    bankAccounts.push({ name: gateways.transfer_bank_2_name, number: gateways.transfer_bank_2_number, holder: gateways.transfer_bank_2_account || '' })
  }

  const c = customer || {}
  const unpaid = invoices.filter(i => i.status === 'unpaid')
  const paid = invoices.filter(i => i.status !== 'unpaid')

  // ── ANIMATION KEYFRAMES ──────────────────────────────────────────────────────
  const GlobalStyles = () => (
    <style>{`
      @keyframes _spin { to { transform: rotate(360deg) } }
      @keyframes slideInRight { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      .portal-page { animation: fadeIn 0.25s ease }
      * { box-sizing: border-box }
    `}</style>
  )

  // ── NAVBAR ───────────────────────────────────────────────────────────────────
  const Navbar = () => (
    <nav style={{
      background: 'var(--header-bg)', borderBottom: `1px solid ${v('--border-color')}`,
      position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      boxShadow: v('--shadow-sm')
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1rem', display: 'flex', alignItems: 'center', height: '56px', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
          <div style={{
            width: '32px', height: '32px',
            background: `linear-gradient(135deg, ${v('--primary-color')}, #22c55e)`,
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <IWifi size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: '800', fontSize: '0.9rem', color: v('--text-main'), fontFamily: 'Outfit, sans-serif' }}>PMY NET</span>
          <span style={{ fontSize: '0.72rem', color: v('--text-muted'), fontWeight: '500', display: 'none' }} className="portal-label">Portal</span>
        </div>
        {[['dashboard', 'Beranda'], ['tagihan', 'Tagihan'], ['riwayat', 'Riwayat'], ['ganti-pin', 'Keamanan']].map(([pg, lbl]) => (
          <button key={pg} onClick={() => goTo(pg)} style={{
            padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.15s', fontFamily: 'inherit',
            background: page === pg ? `${v('--primary-color')}20` : 'transparent',
            color: page === pg ? v('--primary-color') : v('--text-muted'),
          }}>{lbl}</button>
        ))}
        {/* Notification Bell */}
        <div ref={notifPanelRef} style={{ position: 'relative' }}>
          <button onClick={() => { setShowNotifPanel(p => !p); if (!showNotifPanel) fetchPortalNotifs() }} style={{
            position: 'relative', width: '36px', height: '36px', borderRadius: '8px',
            border: `1px solid ${v('--border-color')}`, background: v('--bg-secondary'),
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <IBell size={16} color={v('--text-muted')} />
            {portalUnread > 0 && (
              <span style={{
                position: 'absolute', top: '2px', right: '2px',
                background: '#ef4444', color: '#fff', borderRadius: '50%',
                width: '15px', height: '15px', fontSize: '9px', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{portalUnread > 9 ? '9+' : portalUnread}</span>
            )}
          </button>
          {showNotifPanel && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: '300px', maxHeight: '400px', overflowY: 'auto',
              background: v('--bg-surface'), borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: `1px solid ${v('--border-color')}`,
              zIndex: 999, fontFamily: 'Inter, sans-serif'
            }}>
              <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${v('--border-color')}`, position: 'sticky', top: 0, background: v('--bg-surface'), borderRadius: '12px 12px 0 0' }}>
                <span style={{ fontWeight: '700', fontSize: '0.85rem', color: v('--text-primary') }}>🔔 Notifikasi</span>
                {portalUnread > 0 && (
                  <button onClick={markAllPortalRead} style={{ fontSize: '0.72rem', color: v('--primary-color'), background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                    Semua dibaca
                  </button>
                )}
              </div>
              {portalNotifs.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: v('--text-muted'), fontSize: '0.82rem' }}>
                  Belum ada notifikasi
                </div>
              ) : portalNotifs.map(n => (
                <div key={n.id} onClick={() => markPortalNotifRead(n.id)} style={{
                  padding: '0.7rem 1rem', borderBottom: `1px solid ${v('--border-color')}`,
                  cursor: 'pointer',
                  background: n.read_at ? 'transparent' : 'rgba(99,102,241,0.06)',
                }}>
                  <div style={{ fontWeight: n.read_at ? '500' : '700', fontSize: '0.8rem', color: v('--text-primary'), marginBottom: '2px' }}>{n.title}</div>
                  <div style={{ fontSize: '0.75rem', color: v('--text-muted'), lineHeight: 1.4 }}>{n.body}</div>
                  <div style={{ fontSize: '0.68rem', color: v('--text-muted'), marginTop: '3px' }}>
                    {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button onClick={() => setIsDark(d => !d)} style={{
          width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${v('--border-color')}`,
          background: v('--bg-secondary'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.25rem'
        }}>
          {isDark ? <ISun size={16} color={v('--text-muted')} /> : <IMoon size={16} color={v('--text-muted')} />}
        </button>
        <button onClick={doLogout} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '0.4rem 0.625rem', borderRadius: '8px',
          border: `1px solid ${v('--border-color')}`, background: 'transparent',
          cursor: 'pointer', fontSize: '0.78rem', color: v('--text-muted'), fontFamily: 'inherit'
        }}>
          <ILogOut size={14} /> <span style={{ display: window.innerWidth < 400 ? 'none' : 'inline' }}>Keluar</span>
        </button>
      </div>
    </nav>
  )

  // ── LOGIN PAGE ───────────────────────────────────────────────────────────────
  if (page === 'login') return (
    <div style={{
      minHeight: '100vh', fontFamily: 'Inter, sans-serif',
      background: isDark
        ? 'radial-gradient(ellipse at top left, #1e3a5f 0%, #020617 60%)'
        : 'radial-gradient(ellipse at top left, #dbeafe 0%, #f3f6fb 60%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <GlobalStyles />
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{
        background: v('--bg-surface'), borderRadius: '20px', padding: '2.5rem',
        width: '100%', maxWidth: '420px', boxShadow: v('--shadow-lg'),
        border: `1px solid ${v('--border-color')}`
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px', height: '64px',
            background: `linear-gradient(135deg, ${v('--primary-color')}, #22c55e)`,
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
          }}>
            <IWifi size={32} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: '700', color: v('--text-main') }}>
            Portal Pelanggan
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: v('--text-muted'), fontSize: '0.875rem' }}>
            Masuk menggunakan nomor HP &amp; PIN
          </p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Nomor HP</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: v('--text-muted') }}>
                <IPhone size={18} />
              </div>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="08123456789" required
                style={{ ...inputStyle(isDark), paddingLeft: '2.75rem' }}
                onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>PIN (6 digit)</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: v('--text-muted') }}>
                <ILock size={18} />
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                required
                style={{ ...inputStyle(isDark), paddingLeft: '2.75rem', paddingRight: '2.75rem', letterSpacing: '0.2em' }}
                onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
              <button type="button" onClick={() => setShowPin(s => !s)} style={{
                position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: v('--text-muted'), padding: 0, lineHeight: 1
              }}>
                {showPin ? <IEyeOff size={16} /> : <IEye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '0.875rem',
            background: loading ? v('--text-muted') : `linear-gradient(135deg, ${v('--primary-color')}, #22c55e)`,
            color: '#fff', border: 'none', borderRadius: '10px',
            fontSize: '1rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
          }}>
            {loading ? 'Memverifikasi...' : 'Masuk ke Portal'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem', color: v('--text-muted'), lineHeight: 1.6 }}>
          Nomor HP harus sesuai yang terdaftar di admin ISP.<br />
          PIN diberikan oleh admin saat pertama kali daftar.<br />
          Hubungi admin jika tidak bisa masuk.
        </p>
      </div>
    </div>
  )

  // ── AUTHENTICATED LAYOUT ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: v('--bg-body'), fontFamily: 'Inter, sans-serif' }}>
      <GlobalStyles />
      <Navbar />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem 1rem' }} className="portal-page">

        {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
        {page === 'dashboard' && (
          <div>
            {/* Hero */}
            <div style={{
              background: isDark
                ? 'linear-gradient(135deg, #1e3a5f, #0f172a)'
                : 'linear-gradient(135deg, #1e40af, #0284c7)',
              borderRadius: '16px', padding: '1.75rem', color: '#fff', marginBottom: '1.5rem',
              position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '140px', height: '140px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
              <div style={{ position: 'absolute', right: '40px', bottom: '-40px', width: '100px', height: '100px', background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />
              <p style={{ margin: '0 0 0.25rem', opacity: 0.7, fontSize: '0.82rem' }}>Selamat datang,</p>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: '700', fontFamily: 'Outfit, sans-serif', color: '#fff' }}>
                {c.fullname || c.username}
              </h2>
              <p style={{ margin: '0 0 1rem', opacity: 0.6, fontSize: '0.78rem' }}>ID: {c.customer_id || c.username}</p>
              {c.is_suspended > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.5)', padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: '600' }}>
                  <IAlert size={14} color="#fca5a5" /> <span style={{ color: '#fca5a5' }}>Akses Terisolir</span>
                </div>
              )}
            </div>

            {/* Banner: PIN masih default */}
            {c.pin_is_default == 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)',
                borderRadius: '10px', padding: '10px 14px', marginBottom: '1rem',
                fontSize: '0.8rem', color: '#ff0000ff', fontWeight: '500', lineHeight: 1.5
              }}>
                <IAlert size={16} color="#ff0000ff" style={{ flexShrink: 0 }} />
                <span>
                  Anda masih menggunakan <strong>PIN default</strong>.
                  Segera ubah PIN di menu <button onClick={() => setPage('ganti-pin')} style={{
                    background: 'none', border: 'none', color: '#ff0000ff', fontWeight: '700',
                    cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 'inherit'
                  }}>Keamanan</button> untuk melindungi akun Anda.
                </span>
              </div>
            )}

            {/* Banner: Janji Bayar Aktif */}
            {activePromise && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: '10px', padding: '10px 14px', marginBottom: '1rem',
                fontSize: '0.8rem', color: '#6ee7b7', fontWeight: '500', lineHeight: 1.6
              }}>
                <ICalendar size={16} color="#6ee7b7" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Akses internet Anda <strong>dibuka sementara</strong> berdasarkan janji pembayaran.
                  Harap lunasi tagihan sebelum <strong>{new Date(activePromise.promise_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                  {activePromise.notes ? ` (${activePromise.notes})` : ''}.
                  Akses akan otomatis dicabut jika belum dibayar pada tanggal tersebut.
                </span>
              </div>
            )}

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <InfoCard icon={<IWifi size={18} />} label="Paket Aktif" value={c.package_name || '-'} sub={c.rate_limit || ''} />
              <InfoCard icon={<IPhone size={18} />} label="Nomor HP" value={c.phone || '-'} />
              <InfoCard icon={<IUser size={18} />} label="ID Pelanggan" value={c.customer_id || c.username} />
              <InfoCard icon={<ICalendar size={18} />} label="Jatuh Tempo" value={c.due_date_day ? `Tgl ${c.due_date_day}` : '-'} sub="Setiap bulan" />
            </div>

            {/* ── Connection Status Card ── */}
            <div style={{
              background: v('--bg-surface'), borderRadius: '16px',
              border: `1px solid ${connInfo?.is_online ? (isDark ? '#16532444' : '#bbf7d0') : v('--border-color')}`,
              padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
              boxShadow: connInfo?.is_online ? (isDark ? '0 0 0 1px #16532444' : '0 0 0 1px #bbf7d080') : 'none',
              transition: 'border-color 0.3s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: connInfo ? '1rem' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                    background: connLoading ? '#94a3b8' : connInfo?.is_online ? '#10b981' : '#ef4444',
                    boxShadow: !connLoading && connInfo?.is_online ? '0 0 0 3px #10b98130' : 'none',
                    animation: connInfo?.is_online ? 'connPulse 2s infinite' : 'none'
                  }} />
                  <span style={{ fontWeight: '700', fontSize: '0.95rem', color: v('--text-main') }}>
                    Status Koneksi
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!connLoading && connInfo && (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.05em',
                      padding: '3px 10px', borderRadius: '99px',
                      background: connInfo.is_online ? (isDark ? '#16532444' : '#d1fae5') : (isDark ? '#44141444' : '#fee2e2'),
                      color: connInfo.is_online ? (isDark ? '#6ee7b7' : '#065f46') : (isDark ? '#fca5a5' : '#991b1b'),
                      border: `1px solid ${connInfo.is_online ? (isDark ? '#6ee7b744' : '#10b98130') : (isDark ? '#fca5a544' : '#ef444430')}`
                    }}>
                      {connInfo.is_online ? '● ONLINE' : '○ OFFLINE'}
                    </span>
                  )}
                  <button onClick={fetchConnection} disabled={connLoading} title="Segarkan status" style={{
                    background: 'none', border: 'none', cursor: connLoading ? 'wait' : 'pointer',
                    color: v('--text-muted'), padding: '2px', display: 'flex'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ animation: connLoading ? '_spin 0.75s linear infinite' : 'none' }}>
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                </div>
              </div>

              {connLoading && !connInfo && (
                <div style={{ fontSize: '0.8rem', color: v('--text-muted'), paddingTop: '0.25rem' }}>Memeriksa status...</div>
              )}

              {!connLoading && !connInfo && (
                <div style={{ fontSize: '0.8rem', color: v('--text-muted') }}>Tidak ada data sesi. Tekan ↻ untuk memeriksa.</div>
              )}

              {connInfo && connInfo.is_online && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>IP Address</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.9rem', color: v('--text-main') }}>{connInfo.ip_address || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>Durasi Sesi</div>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: v('--text-main') }}>{fmtDuration(connInfo.session_seconds)}</div>
                    <div style={{ fontSize: '0.72rem', color: v('--text-muted') }}>Sejak {fmtDateTime(connInfo.session_start)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '4px' }}>Upload / Download</div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.82rem', fontWeight: '600', color: '#f59e0b' }}>
                        <IArrowUp size={13} color="#f59e0b" /> {fmtBytes(connInfo.upload_bytes)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.82rem', fontWeight: '600', color: '#3b82f6' }}>
                        <IArrowDown size={13} color="#3b82f6" /> {fmtBytes(connInfo.download_bytes)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {connInfo && !connInfo.is_online && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>Terakhir Online</div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem', color: v('--text-main') }}>
                      {connInfo.last_seen ? fmtDateTime(connInfo.last_seen) : 'Belum pernah'}
                    </div>
                  </div>
                  {connInfo.last_ip && connInfo.last_ip !== '-' && (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>IP Terakhir</div>
                      <div style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '0.85rem', color: v('--text-main') }}>{connInfo.last_ip}</div>
                    </div>
                  )}
                  {connInfo.disconnect_reason && connInfo.disconnect_reason !== '-' && (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>Alasan Putus</div>
                      <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#ef4444' }}>{connInfo.disconnect_reason}</div>
                    </div>
                  )}
                  {connInfo.last_seen && (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '2px' }}>Durasi Terakhir</div>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', color: v('--text-main') }}>{fmtDuration(connInfo.last_session_seconds)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <style>{`@keyframes connPulse { 0%,100%{box-shadow:0 0 0 3px #10b98130} 50%{box-shadow:0 0 0 6px #10b98108} }`}</style>

            {/* Detail grid */}
            <div style={{
              background: v('--bg-surface'), borderRadius: '16px', padding: '1.5rem',
              border: `1px solid ${v('--border-color')}`, marginBottom: '1.5rem'
            }}>
              <SectionTitle icon={<IUser size={16} />}>Data Pelanggan</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.875rem' }}>
                <DetailRow label="Username" value={c.username} />
                <DetailRow label="Alamat" value={c.address} />
                <DetailRow label="Harga Paket" value={c.price ? fmt(c.price) + '/bln' : null} />
                {c.pop && <DetailRow label="POP" value={c.pop} />}
                {c.odp && <DetailRow label="ODP" value={c.odp} />}
                {c.territory_name && <DetailRow label="Wilayah" value={c.territory_name} />}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { label: 'Tagihan Aktif', sub: `${unpaid.length || '?'} belum lunas`, icon: <ICreditCard size={22} />, color: '#2563eb', action: () => goTo('tagihan') },
                { label: 'Riwayat Bayar', sub: 'Histori pembayaran', icon: <IHistory size={22} />, color: '#7c3aed', action: () => goTo('riwayat') },
              ].map((a) => (
                <button key={a.label} onClick={a.action} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1.25rem', background: v('--bg-surface'),
                  border: `1px solid ${v('--border-color')}`, borderRadius: '12px',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit'
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 0 0 3px ${a.color}18` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: a.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: a.color }}>{a.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', color: v('--text-main'), fontSize: '0.9rem' }}>{a.label}</div>
                    <div style={{ fontSize: '0.75rem', color: v('--text-muted'), marginTop: '2px' }}>{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── TAGIHAN ───────────────────────────────────────────────────────── */}
        {page === 'tagihan' && (
          <div>
            <SectionTitle icon={<ICreditCard size={18} />} right={
              <Btn variant="outline" size="sm" onClick={fetchInvoices}>Segarkan</Btn>
            }>
              Tagihan Aktif
            </SectionTitle>
            {loading ? <Spinner /> : unpaid.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '4rem 2rem', borderRadius: '16px',
                background: isDark ? 'rgba(16,185,129,0.06)' : '#f0fdf4',
                border: `1px dashed #10b98150`, color: '#10b981'
              }}>
                <ICheck size={48} />
                <p style={{ marginTop: '1rem', fontWeight: '700', fontSize: '1.05rem' }}>Semua tagihan lunas!</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.8 }}>Terima kasih sudah membayar tepat waktu.</p>
              </div>
            ) : unpaid.map(inv => (
              <InvoiceCard
                key={inv.id} inv={inv} isDark={isDark} customer={c}
                activeGateways={activeGateways}
                banks={bankAccounts}
                expanded={expandedInv === inv.id}
                onToggle={() => setExpandedInv(prev => prev === inv.id ? null : inv.id)}
                onProof={() => openProof(inv)}
                onPG={() => openPG(inv)}
                onPrint={handlePrint}
              />
            ))}
          </div>
        )}

        {/* ── RIWAYAT ───────────────────────────────────────────────────────── */}
        {page === 'riwayat' && (
          <div>
            <SectionTitle icon={<IHistory size={18} />} right={
              <Btn variant="outline" size="sm" onClick={fetchInvoices}>Segarkan</Btn>
            }>
              Riwayat Pembayaran
            </SectionTitle>
            {loading ? <Spinner /> : paid.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '4rem 2rem', borderRadius: '16px',
                background: v('--bg-surface'), border: `1px dashed ${v('--border-color')}`,
                color: v('--text-muted')
              }}>
                <IFileText size={40} color={v('--border-color')} />
                <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>Belum ada riwayat pembayaran.</p>
              </div>
            ) : paid.map(inv => (
              <InvoiceCard
                key={inv.id} inv={inv} isDark={isDark} customer={c}
                activeGateways={[]}
                expanded={expandedInv === inv.id}
                onToggle={() => setExpandedInv(prev => prev === inv.id ? null : inv.id)}
                onPrint={handlePrint}
              />
            ))}

            {/* Summary stats */}
            {paid.length > 0 && (
              <div style={{
                background: v('--bg-surface'), borderRadius: '16px', padding: '1.25rem',
                border: `1px solid ${v('--border-color')}`, marginTop: '1rem',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Total Lunas</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: v('--text-main'), marginTop: '4px' }}>
                    {paid.filter(i => i.status === 'paid').length}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: v('--text-muted'), textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Total Dibayar</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>
                    {fmt(paid.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KEAMANAN / GANTI PIN ──────────────────────────────────────────── */}
        {page === 'ganti-pin' && (
          <ChangePinPage isDark={isDark} loading={loading} onSubmit={handleChangePin} />
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}
      {showProofModal && selectedInv && (
        <ProofModal
          inv={selectedInv}
          isDark={isDark}
          gateways={gateways}
          onClose={() => setShowProofModal(false)}
          onSuccess={(msg) => { setShowProofModal(false); toast$(msg); fetchInvoices() }}
        />
      )}
      {showPGModal && selectedInv && (
        <PGModal
          inv={selectedInv}
          gateways={gateways}
          onClose={() => setShowPGModal(false)}
          onError={(msg) => { setShowPGModal(false); toast$(msg, 'error') }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
