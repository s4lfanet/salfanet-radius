import { Wallet, Activity } from 'lucide-react'
import { monthLabel } from '../../utils/format'

export default function CollectorSettlementsPage({
  settlementMode,
  setSettlementMode,
  settlementDate,
  setSettlementDate,
  settlementSearch,
  setSettlementSearch,
  settlementDateFrom,
  setSettlementDateFrom,
  settlementDateTo,
  setSettlementDateTo,
  settlementFilterCollector,
  setSettlementFilterCollector,
  collectorList = [],
  settlementData = [],
  settlementLoading,
  settlementRangeData,
  settlementRangeLoading,
  settlementConfirmLoading,
  fetchSettlements,
  fetchSettlementRange,
  fetchSettlementDetail,
  confirmSettlement,
  unconfirmSettlement,
}) {
  const fmtRp = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`
  const fmtTime = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={22} /> Rekap Setoran Kolektor
          </h1>
          <p className="page-description">Verifikasi dan konfirmasi setoran kolektor per hari atau per rentang tanggal.</p>
        </div>
      </div>

      {/* ── Mode Toggle ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[{ key: 'daily', label: '📅 Harian' }, { key: 'range', label: '📆 Rentang Tanggal' }].map(m => (
          <button key={m.key}
            className={settlementMode === m.key ? 'btn' : 'btn btn-outline'}
            style={{ fontSize: '0.82rem', padding: '6px 16px', ...(settlementMode === m.key ? { background: 'var(--primary-color)', color: '#fff', border: 'none' } : {}) }}
            onClick={() => setSettlementMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        {settlementMode === 'daily' ? (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Tanggal</label>
              <input type="date" className="search-input" value={settlementDate}
                onChange={e => { setSettlementDate(e.target.value); fetchSettlements(e.target.value) }}
                style={{ paddingLeft: '0.75rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Cari Kolektor</label>
              <input type="text" className="search-input" placeholder="Nama atau username..."
                value={settlementSearch} onChange={e => setSettlementSearch(e.target.value)}
                style={{ paddingLeft: '0.75rem', minWidth: '180px' }} />
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={() => fetchSettlements(settlementDate)}>
              <Activity size={14} /> Refresh
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Dari Tanggal</label>
              <input type="date" className="search-input" value={settlementDateFrom}
                onChange={e => setSettlementDateFrom(e.target.value)}
                style={{ paddingLeft: '0.75rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Sampai Tanggal</label>
              <input type="date" className="search-input" value={settlementDateTo}
                onChange={e => setSettlementDateTo(e.target.value)}
                style={{ paddingLeft: '0.75rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Kolektor</label>
              <select className="search-input" value={settlementFilterCollector}
                onChange={e => setSettlementFilterCollector(e.target.value)}
                style={{ paddingLeft: '0.75rem', minWidth: '180px' }}>
                <option value="">Semua Kolektor</option>
                {collectorList.map(c => (
                  <option key={c.id} value={c.id}>{c.fullname || c.username}</option>
                ))}
              </select>
            </div>
            <button className="btn" style={{ fontSize: '0.82rem', background: 'var(--primary-color)', color: '#fff', border: 'none' }}
              onClick={fetchSettlementRange}>
              <Activity size={14} /> Tampilkan
            </button>
          </div>
        )}
      </div>

      {/* ── Mode Harian ── */}
      {settlementMode === 'daily' && (
        settlementLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Memuat data...</div>
        ) : settlementData.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Wallet size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />
            Tidak ada setoran kolektor pada tanggal ini.
          </div>
        ) : (() => {
          const q = settlementSearch.toLowerCase().trim()
          const filtered = q
            ? settlementData.filter(c =>
                (c.collector_name || '').toLowerCase().includes(q) ||
                (c.collector_username || '').toLowerCase().includes(q))
            : settlementData
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filtered.length === 0 && (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Tidak ada kolektor yang cocok dengan "<strong>{settlementSearch}</strong>".
                </div>
              )}
              {filtered.map(c => {
                const isConfirmed = !!c.confirmation_id
                return (
                  <div key={c.collector_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{c.collector_name || c.collector_username}</span>
                          {isConfirmed ? (
                            <span style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '99px', fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px' }}>
                              ✓ Dikonfirmasi oleh {c.confirmed_by}
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '99px', fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px' }}>
                              ⏳ Belum Dikonfirmasi
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          <span>📄 {c.invoice_count} transaksi</span>
                          <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{fmtRp(c.total_amount)}</span>
                          <span>💵 Cash: {fmtRp(c.cash_amount)}</span>
                          <span>🏦 Transfer: {fmtRp(c.transfer_amount)}</span>
                          {Number(c.discount_amount) > 0 && <span style={{ color: '#f59e0b' }}>🏷 Diskon: {fmtRp(c.discount_amount)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                          onClick={() => fetchSettlementDetail(c.collector_id, settlementDate)}>
                          🔍 Detail
                        </button>
                        {!isConfirmed ? (
                          <button className="btn" style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#10b981', color: '#fff', border: 'none' }}
                            onClick={() => confirmSettlement(c.collector_id, settlementDate)}
                            disabled={settlementConfirmLoading}>
                            ✓ Konfirmasi
                          </button>
                        ) : (
                          <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '5px 12px', color: '#ef4444', borderColor: '#ef4444' }}
                            onClick={() => unconfirmSettlement(c.collector_id, settlementDate)}>
                            Batal Konfirmasi
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()
      )}

      {/* ── Mode Rentang Tanggal ── */}
      {settlementMode === 'range' && (
        settlementRangeLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Memuat data...</div>
        ) : !settlementRangeData ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Wallet size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />
            Pilih rentang tanggal dan klik <strong>Tampilkan</strong>.
          </div>
        ) : settlementRangeData.summary.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Tidak ada data setoran pada rentang tanggal ini.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {settlementRangeData.summary.map(col => {
              const invoices = settlementRangeData.invoices.filter(i => i.paid_by_id === col.collector_id)
              return (
                <div key={col.collector_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '0.85rem 1.25rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{col.collector_name || col.collector_username}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>@{col.collector_username}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                      <span>📄 <strong>{col.invoice_count}</strong> transaksi</span>
                      <span style={{ color: '#10b981', fontWeight: '700' }}>{fmtRp(col.total_amount)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>💵 {fmtRp(col.cash_amount)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>🏦 {fmtRp(col.transfer_amount)}</span>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Invoice</th>
                          <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Pelanggan</th>
                          <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Periode</th>
                          <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Metode</th>
                          <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Tanggal Bayar</th>
                          <th style={{ textAlign: 'right', padding: '7px 12px', color: 'var(--text-muted)', fontWeight: '600' }}>Nominal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map(inv => {
                          const isTransfer = inv.payment_method && inv.payment_method !== 'cash'
                          return (
                            <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>#INV-{String(inv.id).padStart(5, '0')}</td>
                              <td style={{ padding: '7px 12px' }}>
                                <div style={{ fontWeight: '600' }}>{inv.fullname || inv.username}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{inv.username}</div>
                              </td>
                              <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{monthLabel(inv.period)}</td>
                              <td style={{ padding: '7px 12px' }}>
                                {isTransfer
                                  ? <span className="badge" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-color)', fontSize: '0.7rem' }}>Transfer</span>
                                  : <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', fontSize: '0.7rem' }}>Cash</span>}
                              </td>
                              <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{fmtTime(inv.paid_at)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '700', color: '#10b981' }}>{fmtRp(inv.amount)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                          <td colSpan="5" style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', fontSize: '0.82rem' }}>Total:</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '800', color: '#10b981' }}>{fmtRp(col.total_amount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
