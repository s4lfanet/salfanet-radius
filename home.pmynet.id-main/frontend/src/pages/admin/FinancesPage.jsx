import { useState, useRef, useEffect } from 'react'
import { monthLabel } from '../../utils/format'
import {
  Eye, EyeOff, AlertCircle, Wallet, BadgeCent, Smartphone,
  CreditCard, Activity, Download, Printer, MapPin, Tag,
  Users, History, MessageSquare, Send, X, ChevronDown
} from 'lucide-react'
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'

const DUSUN_PER_PAGE = 6

const WA_VARS = ['{nama}', '{tagihan}', '{periode}', '{jatuh_tempo}', '{paket}', '{no_invoice}', '{link_bayar}']

// ─── Modal Blast WA ───────────────────────────────────────────────────────────
function WaBlastModal({ onClose, period, territories = [], profiles = [], authHeader, showToast, settingsForm }) {
  const [step, setStep] = useState('filter') // filter → preview → sending → done
  const [filter, setFilter] = useState({ territory_id: '', groupname: '' })
  const [template, setTemplate] = useState(settingsForm?.wa_template_tagihan || '')
  const [recipients, setRecipients] = useState([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0, log: [] })
  const logRef = useRef(null)

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [progress.log])

  const loadPreview = async () => {
    setLoadingPreview(true)
    try {
      const params = new URLSearchParams({ period })
      if (filter.territory_id) params.append('territory_id', filter.territory_id)
      if (filter.groupname)    params.append('groupname', filter.groupname)
      const res = await fetch(`/api/wa/blast/preview?${params}`, { headers: authHeader?.() })
      const d = await res.json()
      if (!res.ok) { showToast?.(d.error || 'Gagal load preview', 'error'); return }
      setRecipients(d)
      setStep('preview')
    } catch { showToast?.('Gagal konek ke server', 'error') }
    finally { setLoadingPreview(false) }
  }

  const startBlast = async () => {
    setStep('sending')
    setProgress({ sent: 0, failed: 0, total: recipients.length, log: [] })
    try {
      const res = await fetch('/api/wa/blast', {
        method: 'POST',
        headers: { ...authHeader?.(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, territory_id: filter.territory_id, groupname: filter.groupname, template }),
      })
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5).trim())
            if (ev.type === 'progress' || ev.type === 'done') {
              setProgress(p => ({
                sent: ev.sent, failed: ev.failed, total: ev.total,
                log: ev.type === 'progress'
                  ? [...p.log, { username: ev.username, phone: ev.phone, status: ev.status, error: ev.error }]
                  : p.log,
              }))
            }
            if (ev.type === 'done') setStep('done')
          } catch {}
        }
      }
    } catch (err) { showToast?.('Gagal blast: ' + err.message, 'error'); setStep('preview') }
  }

  const pct = progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0

  return (
    <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget && step !== 'sending') onClose() }}>
      <div className="modal-content" style={{ maxWidth: '600px', animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📲 Blast WA Tagihan — {period}</h2>
          {step !== 'sending' && <button className="icon-btn" onClick={onClose}><X size={24} /></button>}
        </div>
        <div className="modal-body" style={{ padding: '1.25rem 0' }}>

          {/* STEP: Filter */}
          {step === 'filter' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Filter Wilayah</label>
                  <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                    value={filter.territory_id} onChange={e => setFilter(f => ({ ...f, territory_id: e.target.value }))}>
                    <option value="">Semua wilayah</option>
                    {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Filter Paket</label>
                  <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                    value={filter.groupname} onChange={e => setFilter(f => ({ ...f, groupname: e.target.value }))}>
                    <option value="">Semua paket</option>
                    {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Template Pesan</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Klik variabel untuk sisipkan:</span>
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {WA_VARS.map(v => (
                    <span key={v} onClick={() => setTemplate(t => t + v)}
                      style={{ fontSize: '0.72rem', background: 'rgba(37,99,235,0.1)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: '600', userSelect: 'none' }}>
                      {v}
                    </span>
                  ))}
                </div>
                <textarea rows={7} className="search-input" style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
                  value={template} onChange={e => setTemplate(e.target.value)} placeholder="Tulis template pesan..." />
              </div>
            </div>
          )}

          {/* STEP: Preview */}
          {step === 'preview' && (
            <div>
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(37,99,235,0.06)', borderRadius: '10px', border: '1px solid rgba(37,99,235,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600' }}>📋 {recipients.length} penerima ditemukan</span>
                <button type="button" onClick={() => setStep('filter')} className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>← Ubah Filter</button>
              </div>
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead><tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600' }}>Nama</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600' }}>No. HP</th>
                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>Tagihan</th>
                  </tr></thead>
                  <tbody>
                    {recipients.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem 0.75rem' }}>{r.fullname || r.username}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{r.phone}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>Rp {Number(r.amount).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.08)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.82rem', color: '#92400e' }}>
                ⚠️ Pesan akan dikirim satu per satu dengan jeda {(parseInt(settingsForm?.wa_delay_ms || '3000') / 1000).toFixed(1)} detik. Estimasi waktu: ±{Math.ceil(recipients.length * parseInt(settingsForm?.wa_delay_ms || '3000') / 60000)} menit.
              </div>
            </div>
          )}

          {/* STEP: Sending / Done */}
          {(step === 'sending' || step === 'done') && (
            <div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                  <span>✅ Terkirim: <strong style={{ color: '#10b981' }}>{progress.sent}</strong> &nbsp; ❌ Gagal: <strong style={{ color: '#ef4444' }}>{progress.failed}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>{progress.sent + progress.failed}/{progress.total}</span>
                </div>
                <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: step === 'done' ? '#10b981' : 'var(--primary-color)', transition: 'width 0.3s', borderRadius: '999px' }} />
                </div>
              </div>
              <div ref={logRef} style={{ maxHeight: '220px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem', border: '1px solid var(--border-color)', lineHeight: '1.8' }}>
                {progress.log.map((l, i) => (
                  <div key={i} style={{ color: l.status === 'ok' ? '#10b981' : '#ef4444' }}>
                    {l.status === 'ok' ? '✅' : '❌'} {l.username} ({l.phone}){l.error ? ` — ${l.error}` : ''}
                  </div>
                ))}
                {step === 'sending' && <div style={{ color: 'var(--text-muted)' }}>Mengirim...</div>}
                {step === 'done' && <div style={{ color: '#10b981', fontWeight: '700', marginTop: '4px' }}>🎉 Selesai!</div>}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          {step === 'filter' && (
            <>
              <button className="btn btn-outline" onClick={onClose}>Batal</button>
              <button className="btn btn-primary" onClick={loadPreview} disabled={loadingPreview || !template.trim()}>
                {loadingPreview ? '⏳ Memuat...' : 'Lihat Penerima →'}
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button className="btn btn-outline" onClick={onClose}>Batal</button>
              <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={startBlast} disabled={!recipients.length}>
                <Send size={15} /> Kirim ke {recipients.length} Pelanggan
              </button>
            </>
          )}
          {step === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>Tutup</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FinancesPage({
  financeInvoices = [],
  financePeriod,
  setFinancePeriod,
  financeRincianPage,
  setFinanceRincianPage,
  financeTrend = [],
  financeByDusun = [],
  financeDiscounts = [],
  dusunPage,
  setDusunPage,
  collectorSetoran = [],
  setoranDate,
  setSetoranDate,
  setoranSearch,
  setSetoranSearch,
  fetchSetoran,
  expandedCollector,
  setExpandedCollector,
  collectorHistory = [],
  historyLoaded,
  expandedHistoryCollector,
  setExpandedHistoryCollector,
  setHistoryLoaded,
  fetchCollectorHistory,
  handleViewCollectorProof,
  exportExcel,
  exportPDF,
  territories = [],
  profiles = [],
  authHeader,
  showToast,
  settingsForm = {},
}) {
  const { currentUser } = useAuthCtx()
  const { hideAmounts, toggleHideAmounts } = useUICtx()
  const [showWaBlast, setShowWaBlast] = useState(false)
  const [piutangData, setPiutangData] = useState(null)
  const [piutangLoading, setPiutangLoading] = useState(false)
  const [showPiutang, setShowPiutang] = useState(false)

  const fetchPiutang = async () => {
    setPiutangLoading(true)
    try {
      const res = await fetch('/api/billing/piutang', { headers: authHeader?.() })
      if (res.ok) setPiutangData(await res.json())
    } catch {}
    finally { setPiutangLoading(false) }
  }

  const periodInvoices = financeInvoices

  const unpaidInvoices = periodInvoices.filter(i => i.status !== 'paid')
  const totalPiutangAmount = unpaidInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)
  const totalPiutangCount = unpaidInvoices.length

  const discountInvoices = periodInvoices.filter(i => i.status === 'paid' && i.payment_method === 'discount')
  const totalDiscountAmount = discountInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)

  const paidInvoices = periodInvoices.filter(i => i.status === 'paid' && i.payment_method !== 'discount')
  const totalLunasAmount = paidInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)
  const totalLunasCount = paidInvoices.length

  const cashInvoices = paidInvoices.filter(i => i.payment_method === 'cash' || !i.payment_method)
  const totalCashAmount = cashInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)

  const onlineInvoices = paidInvoices.filter(i => i.payment_method !== 'cash' && i.payment_method != null)
  const totalOnlineAmount = onlineInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)

  const isCollector = currentUser?.role === 'collector'
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayInvoices = paidInvoices.filter(i => i.paid_at && new Date(i.paid_at).toISOString().slice(0, 10) === todayStr)
  const totalTodayAmount = todayInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isCollector ? 'Progres Penagihan & Setoran' : 'Laporan Keuangan'}</h1>
          <p className="page-description">
            {isCollector
              ? 'Pantau hasil penagihan harian dan total setoran yang harus diserahkan.'
              : 'Laporan detail Omzet berdasarkan status dan metode pembayaran.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!isCollector && settingsForm?.wa_api_url && (
            <button className="btn btn-outline" style={{ borderColor: '#10b981', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowWaBlast(true)}>
              <MessageSquare size={15} /> Blast WA Tagihan
            </button>
          )}
          <button
            onClick={toggleHideAmounts}
            title={hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
          >
            {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
            {hideAmounts ? 'Tampilkan' : 'Sembunyikan'}
          </button>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input
              type="month"
              className="search-input"
              value={financePeriod}
              onChange={e => { setFinancePeriod(e.target.value); setFinanceRincianPage(1) }}
            />
          </div>
        </div>
      </div>

      {showWaBlast && (
        <WaBlastModal
          onClose={() => setShowWaBlast(false)}
          period={financePeriod}
          territories={territories}
          profiles={profiles}
          authHeader={authHeader}
          showToast={showToast}
          settingsForm={settingsForm}
        />
      )}

      <section className="stats-grid">
        {isCollector ? (
          <>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-success"><BadgeCent size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Setoran Hari Ini</span>
                <span className="stat-value" style={{ color: '#10b981' }}>{hideAmounts ? '••••••' : `Rp ${totalTodayAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{todayInvoices.length} Pelanggan Lunas</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-blue"><Wallet size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Penagihan Bulan Ini ({financePeriod})</span>
                <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${totalLunasAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{totalLunasCount} Transaksi Berhasil</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-yellow"><AlertCircle size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Sisa Piutang Wilayah</span>
                <span className="stat-value" style={{ color: '#f59e0b' }}>{hideAmounts ? '••••••' : `Rp ${totalPiutangAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{totalPiutangCount} Pelanggan Belum Bayar</small>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-danger" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><AlertCircle size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Piutang (Belum Bayar)</span>
                <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${totalPiutangAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{totalPiutangCount} Tagihan</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-blue"><Wallet size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total (Lunas Keseluruhan)</span>
                <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${totalLunasAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{totalLunasCount} Transaksi</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-success"><BadgeCent size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Terima (Cash / Tunai)</span>
                <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${totalCashAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{cashInvoices.length} Transaksi</small>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-purple"><Smartphone size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Terima (Transfer Online)</span>
                <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${totalOnlineAmount.toLocaleString()}`}</span>
                <small style={{ color: 'var(--text-muted)' }}>{onlineInvoices.length} Transaksi</small>
              </div>
            </div>
          </>
        )}
      </section>

      {/* === PIUTANG AKTIF (Pascabayar) === */}
      {!isCollector && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 Piutang Aktif <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>(pelanggan pascabayar belum bayar)</span>
            </h2>
            <button className="btn btn-outline" style={{ fontSize: '0.82rem' }}
              onClick={() => { setShowPiutang(v => !v); if (!piutangData) fetchPiutang() }}>
              {piutangLoading ? 'Memuat...' : showPiutang ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
          {showPiutang && piutangData && (
            <div style={{ padding: '0 1.5rem 1.5rem' }}>
              {/* Aging summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                  { label: 'Belum Jatuh Tempo', key: 'current', color: '#10b981' },
                  { label: '1–30 Hari Lewat', key: 'days_30', color: '#f59e0b' },
                  { label: '31–60 Hari Lewat', key: 'days_60', color: '#ef4444' },
                  { label: '>60 Hari Lewat', key: 'over_60', color: '#7f1d1d' },
                ].map(({ label, key, color }) => (
                  <div key={key} style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: `1px solid ${color}33`, background: `${color}0d` }}>
                    <div style={{ fontSize: '0.72rem', color, fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{piutangData.aging_summary[key].count} pelanggan</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Rp {Math.round(piutangData.aging_summary[key].amount).toLocaleString('id-ID')}</div>
                  </div>
                ))}
              </div>
              {/* Tabel detail */}
              {piutangData.rows.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead><tr style={{ background: 'var(--bg-secondary)' }}>
                      {['Nama', 'Username', 'No HP', 'Periode', 'Tagihan', 'Hari Lewat'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {piutangData.rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>{r.fullname || r.username}</td>
                          <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.username}</td>
                          <td style={{ padding: '0.55rem 0.75rem' }}>{r.phone || '-'}</td>
                          <td style={{ padding: '0.55rem 0.75rem' }}>{r.period}</td>
                          <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>Rp {Math.round(r.amount).toLocaleString('id-ID')}</td>
                          <td style={{ padding: '0.55rem 0.75rem' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                              background: r.days_overdue <= 0 ? '#d1fae5' : r.days_overdue <= 30 ? '#fef3c7' : '#fee2e2',
                              color: r.days_overdue <= 0 ? '#065f46' : r.days_overdue <= 30 ? '#92400e' : '#991b1b' }}>
                              {r.days_overdue <= 0 ? 'Belum lewat' : `+${r.days_overdue} hari`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '0.6rem 0.75rem' }}>Total Piutang Pascabayar</td>
                      <td style={{ padding: '0.6rem 0.75rem', color: '#ef4444' }}>Rp {Math.round(piutangData.total).toLocaleString('id-ID')}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Tidak ada piutang pascabayar aktif.</p>
              )}
              <button className="btn btn-outline" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }} onClick={fetchPiutang}>🔄 Refresh</button>
            </div>
          )}
        </section>
      )}

      {(() => {
        const RINCIAN_PER_PAGE = 5
        const rincianTotalPages = Math.max(1, Math.ceil(paidInvoices.length / RINCIAN_PER_PAGE))
        const rincianSlice = paidInvoices.slice((financeRincianPage - 1) * RINCIAN_PER_PAGE, financeRincianPage * RINCIAN_PER_PAGE)
        return (
          <section className="card" style={{ marginTop: '2rem' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 className="card-title">Rincian Transaksi Lunas ({financePeriod})</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {paidInvoices.length} transaksi
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>No. Invoice</th>
                    <th>Pelanggan</th>
                    <th>Periode</th>
                    <th>Nominal</th>
                    <th>Metode Bayar</th>
                    <th>Tanggal Bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {paidInvoices.length > 0 ? rincianSlice.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#INV-{inv.id.toString().padStart(5, '0')}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{inv.fullname || inv.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>User: {inv.username}</div>
                      </td>
                      <td><div className="badge badge-purple">{monthLabel(inv.period)}</div></td>
                      <td style={{ fontWeight: '700' }}>{hideAmounts ? '••••••' : `Rp ${Number(inv.amount).toLocaleString()}`}</td>
                      <td>
                        {(inv.payment_method === 'online' || inv.payment_method === 'transfer') ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-color)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>Transfer Bank</span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.2)' }}>Cash / Tunai</span>
                        )}
                      </td>
                      <td>{new Date(inv.paid_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                        <CreditCard size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} /><br />
                        Belum ada transaksi lunas di periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rincianTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span>Menampilkan {(financeRincianPage - 1) * RINCIAN_PER_PAGE + 1}–{Math.min(financeRincianPage * RINCIAN_PER_PAGE, paidInvoices.length)} dari {paidInvoices.length}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-outline" style={{ padding: '4px 10px' }} disabled={financeRincianPage <= 1} onClick={() => setFinanceRincianPage(1)}>«</button>
                  <button className="btn btn-outline" style={{ padding: '4px 10px' }} disabled={financeRincianPage <= 1} onClick={() => setFinanceRincianPage(p => p - 1)}>‹</button>
                  <span style={{ padding: '4px 10px', fontWeight: '600', color: 'var(--text-primary)' }}>{financeRincianPage} / {rincianTotalPages}</span>
                  <button className="btn btn-outline" style={{ padding: '4px 10px' }} disabled={financeRincianPage >= rincianTotalPages} onClick={() => setFinanceRincianPage(p => p + 1)}>›</button>
                  <button className="btn btn-outline" style={{ padding: '4px 10px' }} disabled={financeRincianPage >= rincianTotalPages} onClick={() => setFinanceRincianPage(rincianTotalPages)}>»</button>
                </div>
              </div>
            )}
          </section>
        )
      })()}

      {/* ===== GRAFIK TREN OMZET 6 BULAN — Admin Only ===== */}
      {currentUser?.role === 'admin' && financeTrend.length > 0 && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={20} /> Tren Omzet 6 Bulan Terakhir
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Cash + Transfer (tidak termasuk diskon)</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}
                onClick={() => exportExcel(financeInvoices, financeByDusun, financeDiscounts, financePeriod)}>
                <Download size={15} /> Export Excel
              </button>
              <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}
                onClick={() => exportPDF(financeInvoices, financeByDusun, financeDiscounts, financePeriod)}>
                <Printer size={15} /> Export PDF
              </button>
            </div>
          </div>
          <div style={{ height: '260px', padding: '0.5rem 0.5rem 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financeTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradTransfer" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={52} />
                <Tooltip formatter={(v, name) => [`Rp ${Number(v).toLocaleString('id-ID')}`, name === 'cash' ? 'Cash' : 'Transfer']} labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                <Legend formatter={v => v === 'cash' ? 'Cash' : 'Transfer'} />
                <Area type="monotone" dataKey="cash" stackId="1" stroke="#10b981" fill="url(#gradCash)" strokeWidth={2} />
                <Area type="monotone" dataKey="transfer" stackId="1" stroke="#6366f1" fill="url(#gradTransfer)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ===== REKAP PER DUSUN — Admin Only ===== */}
      {currentUser?.role === 'admin' && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={20} /> Rekap Per Dusun — {financePeriod}
            </h2>
            {financeByDusun.length > 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {financeByDusun.length} dusun
              </span>
            )}
          </div>
          <div style={{ padding: '1rem' }}>
            {financeByDusun.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Tidak ada data</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {financeByDusun.slice((dusunPage - 1) * DUSUN_PER_PAGE, dusunPage * DUSUN_PER_PAGE).map((d, i) => {
                  const pct = d.total_pelanggan > 0 ? Math.round((Number(d.lunas) + Number(d.diskon)) / d.total_pelanggan * 100) : 0
                  const belum = Number(d.belum_bayar)
                  return (
                    <div key={i} style={{
                      background: 'var(--bg-secondary)', borderRadius: '12px',
                      border: '1px solid var(--border-color)', padding: '0.9rem 1rem',
                      display: 'flex', flexDirection: 'column', gap: '0.55rem'
                    }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.dusun}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>{[d.kelurahan, d.kecamatan].filter(Boolean).join(', ') || '—'}</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.total_pelanggan} pelanggan</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: '700', color: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>{pct}% lunas</span>
                        </div>
                        <div style={{ height: '5px', borderRadius: '4px', background: 'var(--bg-hover)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', transition: 'width 0.5s', background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: '#10b981' }}>{d.lunas}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Lunas</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: belum > 0 ? '#ef4444' : 'var(--text-muted)' }}>{belum}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Belum</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#10b981' }}>
                            {hideAmounts ? '••••' : (Number(d.omzet) >= 1000000
                              ? `${(Number(d.omzet) / 1000000).toFixed(1)}jt`
                              : `${(Number(d.omzet) / 1000).toFixed(0)}rb`)}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Omzet</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {financeByDusun.length > DUSUN_PER_PAGE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {(dusunPage - 1) * DUSUN_PER_PAGE + 1}–{Math.min(dusunPage * DUSUN_PER_PAGE, financeByDusun.length)} dari {financeByDusun.length}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.82rem' }}
                  disabled={dusunPage === 1} onClick={() => setDusunPage(p => p - 1)}>‹ Prev</button>
                {Array.from({ length: Math.ceil(financeByDusun.length / DUSUN_PER_PAGE) }, (_, i) => (
                  <button key={i}
                    className={`btn ${dusunPage === i + 1 ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '4px 10px', fontSize: '0.82rem', minWidth: '32px' }}
                    onClick={() => setDusunPage(i + 1)}>{i + 1}</button>
                ))}
                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.82rem' }}
                  disabled={dusunPage === Math.ceil(financeByDusun.length / DUSUN_PER_PAGE)}
                  onClick={() => setDusunPage(p => p + 1)}>Next ›</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== REKAP DISKON — Admin Only, tampil jika ada ===== */}
      {currentUser?.role === 'admin' && financeDiscounts.length > 0 && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={20} style={{ color: '#d97706' }} /> Rekap Diskon — {financePeriod}
            </h2>
            <span style={{ fontSize: '0.8rem', background: 'rgba(245,158,11,0.12)', color: '#d97706', padding: '2px 10px', borderRadius: '20px', fontWeight: '700' }}>
              {financeDiscounts.length} invoice · Rp {financeDiscounts.reduce((s, d) => s + Number(d.amount), 0).toLocaleString('id-ID')}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Periode</th>
                  <th style={{ textAlign: 'right' }}>Nominal Diskon</th>
                  <th>Alasan</th>
                  <th>Diproses Oleh</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {financeDiscounts.map(d => (
                  <tr key={d.id}>
                    <td data-label="Pelanggan">
                      <div style={{ fontWeight: '600' }}>{d.fullname || d.username}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.username}</div>
                    </td>
                    <td data-label="Periode">{monthLabel(d.period)}</td>
                    <td data-label="Nominal" style={{ textAlign: 'right', fontWeight: '700', color: '#d97706' }}>Rp {Number(d.amount).toLocaleString('id-ID')}</td>
                    <td data-label="Alasan" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{d.discount_reason || '—'}</td>
                    <td data-label="Oleh" style={{ fontSize: '0.82rem' }}>{d.discounted_by_name || '—'}</td>
                    <td data-label="Tanggal" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {d.paid_at ? new Date(d.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== SETORAN COLLECTOR — Admin Only ===== */}
      {currentUser?.role === 'admin' && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} /> Rekap Setoran Collector
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Uang tunai yang harus disetor oleh masing-masing collector
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Tanggal Setoran</label>
                <input
                  type="date"
                  className="search-input"
                  value={setoranDate}
                  onChange={e => setSetoranDate(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
              <button className="btn btn-outline" style={{ alignSelf: 'flex-end', display: 'flex', gap: '0.4rem', alignItems: 'center' }} onClick={() => fetchSetoran(financePeriod)}>
                <Activity size={15} /> Segarkan
              </button>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Cari Kolektor</label>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Nama atau username..."
                  value={setoranSearch}
                  onChange={e => setSetoranSearch(e.target.value)}
                  style={{ fontSize: '0.85rem', minWidth: '180px' }}
                />
              </div>
            </div>
          </div>

          {/* Summary bar */}
          {collectorSetoran.length > 0 && (() => {
            const q = setoranSearch.toLowerCase().trim()
            const filteredSetoran = q
              ? collectorSetoran.filter(c =>
                  (c.collector_name || '').toLowerCase().includes(q) ||
                  (c.collector_username || '').toLowerCase().includes(q)
                )
              : collectorSetoran
            const grandToday = filteredSetoran.reduce((s, c) => s + c.today_amount, 0)
            const grandTodayCash = filteredSetoran.reduce((s, c) => s + (Number(c.today_cash) || 0), 0)
            const grandTodayTf = filteredSetoran.reduce((s, c) => s + (Number(c.today_transfer) || 0), 0)
            const grandPeriod = filteredSetoran.reduce((s, c) => s + c.period_amount, 0)
            const grandPeriodCash = filteredSetoran.reduce((s, c) => s + (Number(c.period_cash) || 0), 0)
            const grandPeriodTf = filteredSetoran.reduce((s, c) => s + (Number(c.period_transfer) || 0), 0)
            return (
              <div style={{ display: 'flex', gap: '1rem', padding: '0.85rem 1.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Setoran Hari Ini</div>
                  <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#10b981' }}>Rp {grandToday.toLocaleString('id-ID')}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Cash: Rp {grandTodayCash.toLocaleString('id-ID')} · TF: Rp {grandTodayTf.toLocaleString('id-ID')}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Periode {financePeriod}</div>
                  <div style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--primary-color)' }}>Rp {grandPeriod.toLocaleString('id-ID')}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Cash: Rp {grandPeriodCash.toLocaleString('id-ID')} · TF: Rp {grandPeriodTf.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Collector cards grid */}
          <div style={{ padding: '1rem' }}>
            {collectorSetoran.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <Users size={40} style={{ opacity: 0.2, marginBottom: '0.75rem', display: 'block', margin: '0 auto 0.75rem' }} />
                Belum ada data setoran collector untuk periode ini.
              </div>
            ) : (() => {
              const q = setoranSearch.toLowerCase().trim()
              const filteredGrid = q
                ? collectorSetoran.filter(c =>
                    (c.collector_name || '').toLowerCase().includes(q) ||
                    (c.collector_username || '').toLowerCase().includes(q)
                  )
                : collectorSetoran
              return (
              <>
                {filteredGrid.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Tidak ada kolektor yang cocok dengan pencarian "<strong>{setoranSearch}</strong>".
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {filteredGrid.map(col => {
                    const isExpanded = expandedCollector === col.collector_id
                    return (
                      <div key={col.collector_id}
                        onClick={() => setExpandedCollector(isExpanded ? null : col.collector_id)}
                        style={{
                          background: isExpanded ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                          border: `1px solid ${isExpanded ? 'var(--primary-color)' : 'var(--border-color)'}`,
                          borderRadius: '12px', padding: '0.9rem 1rem',
                          cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
                          display: 'flex', flexDirection: 'column', gap: '0.6rem'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-main)' }}>{col.collector_name || col.collector_username}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{col.collector_username}</div>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: isExpanded ? 'var(--primary-color)' : 'var(--text-muted)', fontWeight: '600' }}>
                            {isExpanded ? '▲ Tutup' : '▼ Detail'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Hari Ini</div>
                            <div style={{ fontWeight: '800', fontSize: '0.92rem', color: col.today_amount > 0 ? '#10b981' : 'var(--text-muted)' }}>
                              {Number(col.today_amount) >= 1000000
                                ? `Rp ${(Number(col.today_amount) / 1000000).toFixed(1)}jt`
                                : `Rp ${(Number(col.today_amount) / 1000).toFixed(0)}rb`}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: '#16a34a' }}>C: {Number(col.today_cash / 1000).toFixed(0)}rb</span>
                              {' · '}
                              <span style={{ color: 'var(--accent-color)' }}>TF: {Number(col.today_transfer / 1000).toFixed(0)}rb</span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{col.today_count} transaksi</div>
                          </div>
                          <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '0.5rem' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Bulan Ini</div>
                            <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--primary-color)' }}>
                              {Number(col.period_amount) >= 1000000
                                ? `Rp ${(Number(col.period_amount) / 1000000).toFixed(1)}jt`
                                : `Rp ${(Number(col.period_amount) / 1000).toFixed(0)}rb`}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span style={{ color: '#16a34a' }}>C: {Number(col.period_cash / 1000).toFixed(0)}rb</span>
                              {' · '}
                              <span style={{ color: 'var(--accent-color)' }}>TF: {Number(col.period_transfer / 1000).toFixed(0)}rb</span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{col.period_count} transaksi</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Detail panel — full width, di bawah grid */}
                {expandedCollector && (() => {
                  const col = collectorSetoran.find(c => c.collector_id === expandedCollector)
                  if (!col) return null
                  const filtered = col.invoices.filter(i => i.paid_at && new Date(i.paid_at).toISOString().slice(0, 10) === setoranDate)
                  const totalCash = filtered.filter(i => !i.payment_method || i.payment_method === 'cash').reduce((s, i) => s + Number(i.amount), 0)
                  const totalTf = filtered.filter(i => i.payment_method && i.payment_method !== 'cash').reduce((s, i) => s + Number(i.amount), 0)
                  return (
                    <div style={{ marginTop: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--primary-color)', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Invoice {col.collector_name} — {setoranDate}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{filtered.length} transaksi</span>
                      </div>
                      {filtered.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tidak ada transaksi pada tanggal ini.</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Invoice</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Pelanggan</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Wilayah</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Metode</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Nominal</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: '600' }}>Jam</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(inv => {
                                const isTransfer = inv.payment_method && inv.payment_method !== 'cash'
                                return (
                                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>#INV-{inv.id.toString().padStart(5, '0')}</td>
                                    <td style={{ padding: '7px 8px', fontWeight: '600' }}>
                                      {inv.fullname || inv.username}
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{inv.username}</div>
                                    </td>
                                    <td style={{ padding: '7px 8px' }}>
                                      <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{inv.territory_name || '-'}</span>
                                    </td>
                                    <td style={{ padding: '7px 8px' }}>
                                      {isTransfer ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span className="badge" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-color)', fontSize: '0.7rem' }}>Transfer</span>
                                          {inv.has_proof ? (
                                            <button type="button" onClick={e => { e.stopPropagation(); handleViewCollectorProof(inv.id) }}
                                              style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--accent-color)', background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer' }}>
                                              Bukti
                                            </button>
                                          ) : (
                                            <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>⚠ No Bukti</span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="badge" style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontSize: '0.7rem' }}>Cash</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '700' }}>Rp {Number(inv.amount).toLocaleString('id-ID')}</td>
                                    <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                      {new Date(inv.paid_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="4" style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cash:</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>Rp {totalCash.toLocaleString('id-ID')}</td>
                                <td></td>
                              </tr>
                              <tr>
                                <td colSpan="4" style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Transfer:</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--accent-color)' }}>Rp {totalTf.toLocaleString('id-ID')}</td>
                                <td></td>
                              </tr>
                              <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                                <td colSpan="4" style={{ padding: '8px', textAlign: 'right', fontWeight: '700', fontSize: '0.82rem' }}>Total:</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '800', color: '#10b981' }}>Rp {(totalCash + totalTf).toLocaleString('id-ID')}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
              )
            })()}
          </div>
        </section>
      )}

      {/* ===== HISTORI COLLECTOR — Admin Only ===== */}
      {currentUser?.role === 'admin' && (
        <>
        <section className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={20} /> Histori Penagihan Collector
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Riwayat bulanan per collector — 6 bulan terakhir
              </p>
            </div>
            <button className="btn btn-outline" style={{ alignSelf: 'flex-end', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
              onClick={() => { setHistoryLoaded(false); fetchCollectorHistory() }}>
              <Activity size={15} /> Refresh
            </button>
          </div>

          {collectorHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <History size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />
              {historyLoaded ? 'Belum ada data histori collector.' : 'Memuat data histori...'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {collectorHistory.map(col => (
                <div key={col.collector_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.5rem', cursor: 'pointer', background: expandedHistoryCollector === col.collector_id ? 'var(--bg-secondary)' : 'transparent' }}
                    onClick={() => setExpandedHistoryCollector(expandedHistoryCollector === col.collector_id ? null : col.collector_id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '0.9rem', flexShrink: 0 }}>
                        {(col.collector_name || col.collector_username || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600' }}>{col.collector_name || col.collector_username}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{col.collector_username} · {col.monthly.length} bulan aktif</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {col.monthly.length > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: '#10b981', fontSize: '0.9rem' }}>
                            Rp {col.monthly.reduce((s, m) => s + m.total_amount, 0).toLocaleString('id-ID')}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {col.monthly.reduce((s, m) => s + m.total_count, 0)} transaksi total
                          </div>
                        </div>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {expandedHistoryCollector === col.collector_id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {expandedHistoryCollector === col.collector_id && (
                    <div style={{ padding: '0 1.5rem 1.25rem', background: 'var(--bg-secondary)' }}>
                      {col.monthly.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>Tidak ada aktivitas dalam 6 bulan terakhir.</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: '600' }}>BULAN</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: '#16a34a', fontWeight: '600' }}>CASH</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--accent-color)', fontWeight: '600' }}>TRANSFER</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: '600' }}>TRX</th>
                              </tr>
                            </thead>
                            <tbody>
                              {col.monthly.map(m => {
                                const [yr, mo] = m.month.split('-')
                                const label = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                                const isCurrentMonth = m.month === new Date().toISOString().substring(0, 7)
                                return (
                                  <tr key={m.month} style={{ borderBottom: '1px solid var(--border-color)', background: isCurrentMonth ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                                    <td style={{ padding: '8px 10px', fontWeight: isCurrentMonth ? '700' : '400' }}>
                                      {label}
                                      {isCurrentMonth && <span className="badge" style={{ marginLeft: '6px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontSize: '0.65rem' }}>Bulan Ini</span>}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#10b981' }}>
                                      Rp {m.total_amount.toLocaleString('id-ID')}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16a34a' }}>
                                      Rp {m.cash_amount.toLocaleString('id-ID')}
                                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.cash_count} trx</div>
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent-color)' }}>
                                      Rp {m.transfer_amount.toLocaleString('id-ID')}
                                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.transfer_count} trx</div>
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{m.total_count}</span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                                <td style={{ padding: '8px 10px', fontWeight: '700', fontSize: '0.82rem' }}>Grand Total</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#10b981' }}>
                                  Rp {col.monthly.reduce((s, m) => s + m.total_amount, 0).toLocaleString('id-ID')}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>
                                  Rp {col.monthly.reduce((s, m) => s + m.cash_amount, 0).toLocaleString('id-ID')}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: 'var(--accent-color)' }}>
                                  Rp {col.monthly.reduce((s, m) => s + m.transfer_amount, 0).toLocaleString('id-ID')}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700' }}>
                                  <span className="badge badge-purple">{col.monthly.reduce((s, m) => s + m.total_count, 0)}</span>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        </>
      )}
    </div>
  )
}
