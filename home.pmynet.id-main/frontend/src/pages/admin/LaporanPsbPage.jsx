import { useState } from 'react'
import { CalendarCheck, CheckCircle, Users, ChevronDown } from 'lucide-react'
import { useAuthCtx } from '../../context/AuthContext.jsx'

const INSTALL_LOG_PER_PAGE = 5

export default function LaporanPsbPage({
  systemStaff = [],
  users = [],
  rekapMonth,
  setRekapMonth,
  rekapExpandedTech,
  setRekapExpandedTech,
  installLogMode,
  setInstallLogMode,
  installLogDate,
  setInstallLogDate,
  installLogMonth,
  setInstallLogMonth,
  installLogData = [],
  installLogLoading,
  installLogPage,
  setInstallLogPage,
  fetchInstallLog,
  exportInstallLogExcel,
  exportRekapTeknisiExcel,
}) {
  const teknisiList = systemStaff.filter(s => s.role === 'technician')

  const [ry, rm] = rekapMonth.split('-').map(Number)
  const prevDate = new Date(ry, rm - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const prev2Date = new Date(ry, rm - 3, 1)
  const prev2Month = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, '0')}`

  const monthLabel = (m) => {
    const [y, mo] = m.split('-')
    return new Date(y, mo - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  const techStats = teknisiList.map(tech => {
    const mine = users.filter(u => u.created_by_id === tech.id)
    return {
      ...tech,
      total: mine.filter(u => u.created_at).length,
      thisMonth: mine.filter(u => u.created_at?.slice(0, 7) === rekapMonth).length,
      prevMonth: mine.filter(u => u.created_at?.slice(0, 7) === prevMonth).length,
      prev2Month: mine.filter(u => u.created_at?.slice(0, 7) === prev2Month).length,
      installs: mine
    }
  }).sort((a, b) => b.thisMonth - a.thisMonth)

  return (
    <div className="tab-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-title-area">
          <h1 className="page-title">Laporan PSB</h1>
          <p className="page-description">Log pemasangan pelanggan baru dan rekap kinerja teknisi.</p>
        </div>
      </div>

      {/* ===== LOG INSTALASI PER HARI / BULAN ===== */}
      <section className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
        <div className="card-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <CalendarCheck size={18} /> Log Instalasi Pelanggan Baru
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Data permanen — tersimpan walau pelanggan dihapus</p>
          </div>
        </div>
        <div style={{ padding: '0.9rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {['day', 'month'].map(m => (
              <button key={m} type="button"
                style={{ padding: '5px 14px', fontSize: '0.8rem', border: 'none', cursor: 'pointer', fontWeight: installLogMode === m ? '700' : '400', background: installLogMode === m ? 'var(--primary-color)' : 'var(--bg-surface)', color: installLogMode === m ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}
                onClick={() => setInstallLogMode(m)}>
                {m === 'day' ? 'Per Hari' : 'Per Bulan'}
              </button>
            ))}
          </div>
          {installLogMode === 'day' ? (
            <input type="date" className="search-input" style={{ paddingLeft: '0.75rem', width: 'auto' }}
              value={installLogDate} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setInstallLogDate(e.target.value)} />
          ) : (
            <input type="month" className="search-input" style={{ paddingLeft: '0.75rem', width: 'auto' }}
              value={installLogMonth} max={new Date().toISOString().slice(0, 7)}
              onChange={e => setInstallLogMonth(e.target.value)} />
          )}
          <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '5px 16px' }}
            onClick={() => fetchInstallLog(installLogMode, installLogDate, installLogMonth)}>
            Tampilkan
          </button>
          {installLogData.length > 0 && (
            <button className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={exportInstallLogExcel}>
              ⬇ Excel
            </button>
          )}
        </div>
        {installLogLoading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }}></div>Memuat data...
          </div>
        ) : installLogData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <CalendarCheck size={32} style={{ opacity: 0.15, display: 'block', margin: '0 auto 0.5rem' }} />
            Tidak ada instalasi — klik <strong>Tampilkan</strong> untuk mencari
          </div>
        ) : (() => {
          const totalPages = Math.ceil(installLogData.length / INSTALL_LOG_PER_PAGE)
          const safePage = Math.min(installLogPage, totalPages)
          const pageData = installLogData.slice((safePage - 1) * INSTALL_LOG_PER_PAGE, safePage * INSTALL_LOG_PER_PAGE)
          const periodLabel = installLogMode === 'day'
            ? new Date(installLogDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : new Date(installLogMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
          return (
            <>
              <div style={{ padding: '0.65rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', background: 'rgba(16,185,129,0.05)' }}>
                <CheckCircle size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                <strong style={{ color: '#10b981' }}>{installLogData.length} instalasi</strong>
                <span style={{ color: 'var(--text-muted)' }}>— {periodLabel}</span>
              </div>
              <table className="data-table modern-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>No</th>
                    <th>Pelanggan</th>
                    <th>NIK</th>
                    <th>Paket</th>
                    <th>Wilayah</th>
                    <th>Teknisi</th>
                    <th>Tgl Pasang</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((row, idx) => (
                    <tr key={row.id}>
                      <td data-label="No" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                        {(safePage - 1) * INSTALL_LOG_PER_PAGE + idx + 1}
                      </td>
                      <td data-label="Pelanggan">
                        <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>{row.fullname || row.username}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.username} · {row.customer_id}</div>
                      </td>
                      <td data-label="NIK" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.identity_number || '-'}</td>
                      <td data-label="Paket">
                        <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>{row.groupname || '-'}</span>
                      </td>
                      <td data-label="Wilayah" style={{ fontSize: '0.82rem' }}>{row.territory_name || '-'}</td>
                      <td data-label="Teknisi" style={{ fontSize: '0.82rem' }}>{row.installed_by_name || '-'}</td>
                      <td data-label="Tgl Pasang" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {new Date(row.install_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {row.original_install_date && (() => {
                            const orig = new Date(row.original_install_date).toISOString().slice(0,10)
                            const curr = new Date(row.install_date).toISOString().slice(0,10)
                            if (orig === curr) return null
                            return (
                              <span title={`Tanggal asli PSB: ${new Date(row.original_install_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)', cursor: 'help', whiteSpace: 'nowrap' }}>
                                📅 Pindahan
                              </span>
                            )
                          })()}
                        </div>
                        {row.original_install_date && (() => {
                          const orig = new Date(row.original_install_date).toISOString().slice(0,10)
                          const curr = new Date(row.install_date).toISOString().slice(0,10)
                          if (orig === curr) return null
                          return (
                            <div style={{ fontSize: '0.68rem', color: '#b45309', marginTop: '2px' }}>
                              Asli: {new Date(row.original_install_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={safePage <= 1} onClick={() => setInstallLogPage(safePage - 1)}>‹ Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setInstallLogPage(p)}
                      style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: p === safePage ? '700' : '400', background: p === safePage ? 'var(--primary-color)' : 'var(--bg-surface)', color: p === safePage ? '#fff' : 'var(--text-main)' }}>
                      {p}
                    </button>
                  ))}
                  <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={safePage >= totalPages} onClick={() => setInstallLogPage(safePage + 1)}>Next ›</button>
                </div>
              )}
            </>
          )
        })()}
      </section>

      {/* ===== REKAP KINERJA TEKNISI ===== */}
      {teknisiList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Users size={32} style={{ opacity: 0.15, display: 'block', margin: '0 auto 0.5rem' }} />
          Belum ada teknisi terdaftar
        </div>
      ) : (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="card-title" style={{ marginBottom: '2px' }}>Rekap Kinerja Teknisi</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Jumlah instalasi pelanggan baru per teknisi</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Bulan:</label>
              <input type="month" className="search-input" style={{ paddingLeft: '0.75rem', width: 'auto' }}
                value={rekapMonth} onChange={e => { setRekapMonth(e.target.value); setRekapExpandedTech(null) }} />
              <button className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => exportRekapTeknisiExcel(techStats, rekapMonth, prevMonth, prev2Month, monthLabel)}>
                ⬇ Excel
              </button>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>{monthLabel(prev2Month)}: </span>
              <strong style={{ color: 'var(--text-main)' }}>{techStats.reduce((s, t) => s + t.prev2Month, 0)}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>{monthLabel(prevMonth)}: </span>
              <strong style={{ color: 'var(--text-main)' }}>{techStats.reduce((s, t) => s + t.prevMonth, 0)}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>{monthLabel(rekapMonth)}: </span>
              <strong style={{ color: 'var(--primary-color)', fontSize: '0.9rem' }}>{techStats.reduce((s, t) => s + t.thisMonth, 0)}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Total sepanjang masa: <strong style={{ color: 'var(--text-main)' }}>{techStats.reduce((s, t) => s + t.total, 0)}</strong>
            </div>
          </div>

          {/* Cards grid */}
          <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {techStats.map(tech => {
              const isExpanded = rekapExpandedTech === tech.id
              const thisMonthInstalls = tech.installs
                .filter(u => u.created_at?.slice(0, 7) === rekapMonth)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              const initials = tech.fullname?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || tech.username[0].toUpperCase()
              return (
                <div key={tech.id} style={{
                  background: isExpanded ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                  border: `1px solid ${isExpanded ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  borderRadius: '12px', overflow: 'hidden',
                  transition: 'border-color 0.2s, background 0.2s'
                }}>
                  {/* Card header */}
                  <div style={{ padding: '0.9rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                    onClick={() => setRekapExpandedTech(isExpanded ? null : tech.id)}>
                    <div className="avatar" style={{ width: '36px', height: '36px', fontSize: '0.78rem', flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tech.fullname || tech.username}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>@{tech.username}</div>
                    </div>
                    <ChevronDown size={14} style={{ color: 'var(--text-muted)', transition: '0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '0.6rem 0.5rem', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{monthLabel(prev2Month)}</div>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: tech.prev2Month > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>{tech.prev2Month}</div>
                    </div>
                    <div style={{ padding: '0.6rem 0.5rem', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{monthLabel(prevMonth)}</div>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: tech.prevMonth > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>{tech.prevMonth}</div>
                    </div>
                    <div style={{ padding: '0.6rem 0.5rem', textAlign: 'center', background: tech.thisMonth > 0 ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--primary-color)', fontWeight: '600', marginBottom: '2px' }}>{monthLabel(rekapMonth)}</div>
                      <div style={{ fontWeight: '800', fontSize: '1.1rem', color: tech.thisMonth > 0 ? 'var(--primary-color)' : 'var(--text-muted)' }}>{tech.thisMonth}</div>
                    </div>
                  </div>

                  {/* Total badge */}
                  <div style={{ padding: '0.4rem 1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Total sepanjang masa</span>
                    <span className="badge badge-isolir">{tech.total}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem 1rem', background: 'var(--bg-hover)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        Instalasi {monthLabel(rekapMonth)} — {thisMonthInstalls.length} pelanggan
                      </div>
                      {thisMonthInstalls.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Tidak ada instalasi bulan ini</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {thisMonthInstalls.map((u, i) => (
                            <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', padding: '0.3rem 0.5rem', background: 'var(--bg-surface)', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--text-muted)', minWidth: '16px', fontSize: '0.7rem' }}>{i + 1}.</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullname || u.username}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{u.groupname}</div>
                              </div>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>
                                {u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
