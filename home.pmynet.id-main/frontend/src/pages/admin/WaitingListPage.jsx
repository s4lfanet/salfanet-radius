import { useState, useEffect } from 'react'
import { ClipboardList, UserPlus, Search, Activity, ChevronDown } from 'lucide-react'
import WhatsAppIcon from '../../components/WhatsAppIcon'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

const WL_PER_PAGE = 20

export default function WaitingListPage({
  waitingList = [],
  wlSearch,
  setWlSearch,
  wlStatusFilter,
  setWlStatusFilter,
  wlSelectedIds,
  setWlSelectedIds,
  wlLoading,
  fetchWaitingList,
  openWlModal,
  openWlBulkAssignModal,
  openWlAssignModal,
  viewWlKtp,
  cancelWlEntry,
  restoreWlEntry,
  selectWlForPsb,
  psbFromWlRef,
}) {
  const { currentUser } = useAuthCtx()
  const { showToast } = useUICtx()
  const { navigateTo } = useNavCtx()
  const isAdmin = currentUser?.role === 'admin'
  const isAdminOrNoc = ['admin', 'noc'].includes(currentUser?.role)
  const statusColors = { waiting: '#f59e0b', installed: '#10b981', cancelled: '#6b7280' }
  const statusLabels = { waiting: '⏳ Menunggu', installed: '✅ Terpasang', cancelled: '❌ Dibatalkan' }
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [wlPage, setWlPage] = useState(1)
  const [wlVisibleCount, setWlVisibleCount] = useState(WL_PER_PAGE)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Reset paginasi saat filter atau search berubah
  useEffect(() => { setWlPage(1); setWlVisibleCount(WL_PER_PAGE) }, [wlStatusFilter, wlSearch])

  const filteredWl = waitingList.filter(w => {
    if (!wlSearch.trim()) return true
    const q = wlSearch.toLowerCase()
    return (
      (w.fullname || '').toLowerCase().includes(q) ||
      (w.phone || '').includes(q) ||
      (w.identity_number || '').includes(q) ||
      (w.address || '').toLowerCase().includes(q) ||
      (w.territory_name || '').toLowerCase().includes(q) ||
      (w.notes || '').toLowerCase().includes(q)
    )
  })

  const totalPages = Math.ceil(filteredWl.length / WL_PER_PAGE)
  const pagedWl = isMobile
    ? filteredWl.slice(0, wlVisibleCount)
    : filteredWl.slice((wlPage - 1) * WL_PER_PAGE, wlPage * WL_PER_PAGE)
  const hasMore = isMobile && wlVisibleCount < filteredWl.length

  const openWa = (phone, name) => {
    if (!phone) return showToast('Nomor telepon tidak tersedia', 'warning')
    const normalized = phone.replace(/\D/g, '').replace(/^0/, '62')
    window.open(`https://wa.me/${normalized}`, '_blank')
  }

  return (
    <div className="tab-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ClipboardList size={22} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Waiting List Pemasangan</h1>
          <p className="page-description">{isAdminOrNoc ? 'Kelola antrian calon pelanggan yang menunggu pemasangan.' : 'Daftar calon pelanggan di wilayahmu yang siap dipasang.'}</p>
        </div>
        {isAdminOrNoc && (
          <button className="btn btn-primary" onClick={() => openWlModal()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserPlus size={16} /> Tambah Antrian
          </button>
        )}
      </div>

      {/* Filter status + Search */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {['waiting', 'installed', 'cancelled'].map(s => (
          <button key={s} onClick={() => { setWlStatusFilter(s); setWlSelectedIds([]) }}
            className={`btn ${wlStatusFilter === s ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.35rem 1rem', fontSize: '0.82rem' }}>
            {statusLabels[s]}
            {s === 'waiting' && waitingList.filter(w => w.status === 'waiting').length > 0 && wlStatusFilter !== 'waiting' && (
              <span className="nav-badge" style={{ marginLeft: '6px', background: '#f59e0b', position: 'static', width: 'auto', height: 'auto', fontSize: '0.65rem' }}></span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: '400px' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          className="search-input"
          placeholder="Cari nama, telepon, NIK, alamat, catatan..."
          value={wlSearch}
          onChange={e => setWlSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: wlSearch ? '2rem' : '0.875rem' }}
        />
        {wlSearch && (
          <button onClick={() => setWlSearch('')}
            style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Floating bulk-assign bar */}
      {isAdminOrNoc && wlStatusFilter === 'waiting' && wlSelectedIds.length > 0 && (
        <div style={{
          position: 'sticky', top: '70px', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.65rem 1rem', marginBottom: '0.75rem',
          background: 'var(--primary-color)', borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(37,99,235,0.3)', color: '#fff'
        }}>
          <span style={{ fontWeight: '600', fontSize: '0.88rem' }}>
            {wlSelectedIds.length} pelanggan dipilih
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setWlSelectedIds([])}
              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '6px', color: '#fff', padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer' }}>
              Batal Pilih
            </button>
            <button onClick={openWlBulkAssignModal}
              style={{ background: '#fff', border: 'none', borderRadius: '6px', color: 'var(--primary-color)', fontWeight: '700', padding: '4px 14px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              👤 Tugaskan Teknisi
            </button>
          </div>
        </div>
      )}

      <section className="card wl-table">
        <div className="card-header">
          <h2 className="card-title" style={{ fontSize: '0.95rem' }}>
            {statusLabels[wlStatusFilter]} — {filteredWl.length}{wlSearch ? ` dari ${waitingList.length}` : ''} entri
          </h2>
          <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}
            onClick={() => fetchWaitingList()}>
            <Activity size={14} /> Segarkan
          </button>
        </div>

        {wlLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat...</div>
        ) : filteredWl.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ClipboardList size={40} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.75rem' }} />
            {wlSearch
              ? `Tidak ada hasil untuk "${wlSearch}"`
              : (currentUser?.role === 'technician' && wlStatusFilter === 'waiting'
                ? 'Belum ada pelanggan yang ditugaskan ke kamu. Hubungi NOC/Admin.'
                : 'Tidak ada antrian')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  {isAdminOrNoc && wlStatusFilter === 'waiting' && (
                    <th style={{ width: '36px', textAlign: 'center' }}>
                      <input type="checkbox"
                        checked={pagedWl.length > 0 && pagedWl.every(w => wlSelectedIds.includes(w.id))}
                        onChange={e => setWlSelectedIds(e.target.checked ? pagedWl.map(w => w.id) : [])}
                        title="Pilih semua"
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                      />
                    </th>
                  )}
                  <th>Nama & Catatan</th>
                  <th>Telepon</th>
                  <th>Paket</th>
                  <th>Wilayah</th>
                  <th>Tanggal Daftar</th>
                  {isAdminOrNoc && <th>Sales</th>}
                  {isAdminOrNoc && wlStatusFilter === 'waiting' && <th>Ditugaskan</th>}
                  {wlStatusFilter === 'installed' && <th>Dipasang Oleh</th>}
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedWl.map(w => (
                  <tr key={w.id} style={wlSelectedIds.includes(w.id) ? { background: 'rgba(37,99,235,0.06)' } : {}}>
                    {isAdminOrNoc && wlStatusFilter === 'waiting' && (
                      <td style={{ textAlign: 'center', width: '36px' }}>
                        <input type="checkbox"
                          checked={wlSelectedIds.includes(w.id)}
                          onChange={e => setWlSelectedIds(prev =>
                            e.target.checked ? [...prev, w.id] : prev.filter(id => id !== w.id)
                          )}
                          style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                      </td>
                    )}
                    <td data-label="Nama">
                      <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {w.fullname}
                        {w.assigned_technicians?.length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '99px', padding: '1px 7px', fontSize: '0.65rem', fontWeight: '700', flexShrink: 0 }}>
                            ✓ Ditugaskan
                          </span>
                        )}
                      </div>
                      {w.address && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.address}</div>}
                      {w.notes && (
                        <div className="wl-notes-inline" style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '3px', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                          <span style={{ flexShrink: 0 }}>📝</span>{w.notes}
                        </div>
                      )}
                    </td>
                    <td data-label="Telepon">
                      {w.phone ? (
                        <button onClick={() => openWa(w.phone, w.fullname)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '5px', color: '#25d366', fontWeight: '600', fontSize: '0.85rem' }}
                          title={`Chat WA ${w.fullname}`}>
                          <WhatsAppIcon size={14} color="#25d366" />{w.phone}
                        </button>
                      ) : '—'}
                    </td>
                    <td data-label="Paket">
                      {w.groupname ? <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>{w.groupname}</span> : '—'}
                    </td>
                    <td data-label="Wilayah">
                      {w.territory_name ? <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>{w.territory_name}</span> : '—'}
                    </td>
                    <td data-label="Tanggal" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span>{fmtDate(w.created_at)}</span>
                        {w.notes && (
                          <div className="wl-notes-cell" style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: '4px', textAlign: 'right' }}>
                            <span style={{ flexShrink: 0 }}>📝</span>{w.notes}
                          </div>
                        )}
                      </div>
                    </td>
                    {isAdminOrNoc && <td data-label="Sales" style={{ fontSize: '0.82rem' }}>{w.sales || '—'}</td>}
                    {isAdminOrNoc && wlStatusFilter === 'waiting' && (
                      <td data-label="Ditugaskan">
                        {w.assigned_technicians?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {w.assigned_technicians.map(t => (
                              <span key={t} className="badge" style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)', fontSize: '0.7rem', width: 'fit-content' }}>
                                🔧 {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                        )}
                      </td>
                    )}
                    {wlStatusFilter === 'installed' && (
                      <td data-label="Dipasang">
                        <div style={{ fontSize: '0.82rem' }}>{w.installed_by || '—'}</div>
                        {w.pppoe_username && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{w.pppoe_username}</div>}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{fmtDate(w.installed_at)}</div>
                      </td>
                    )}
                    <td data-label="Aksi" style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                          onClick={() => viewWlKtp(w.id)}>
                          🪪 KTP
                        </button>
                        {currentUser?.role === 'technician' && w.status === 'waiting' && (
                          <>
                            {w.latitude && w.longitude && (
                              <a href={`https://www.google.com/maps/dir/?api=1&destination=${w.latitude},${w.longitude}`}
                                target="_blank" rel="noreferrer" className="btn btn-outline"
                                style={{ padding: '3px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', borderColor: '#2563eb', textDecoration: 'none' }}>
                                🧭 Navigasi
                              </a>
                            )}
                            <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                              onClick={() => { psbFromWlRef.current = true; navigateTo('psb'); selectWlForPsb(w) }}>
                              🔧 Pasang
                            </button>
                          </>
                        )}
                        {isAdminOrNoc && w.status === 'waiting' && (
                          <>
                            <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#2563eb', borderColor: '#2563eb' }}
                              onClick={() => openWlAssignModal(w)}>
                              👤 {w.assigned_technicians?.length > 0 ? 'Edit Tugas' : 'Tugaskan'}
                            </button>
                            <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                              onClick={() => openWlModal(w)}>✏️ Edit</button>
                            <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}
                              onClick={() => cancelWlEntry(w.id, w.fullname)}>Batalkan</button>
                          </>
                        )}
                        {isAdminOrNoc && w.status === 'cancelled' && (
                          <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#16a34a', borderColor: '#16a34a' }}
                            onClick={() => restoreWlEntry(w.id, w.fullname)}>↩ Kembalikan</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: Load More */}
        {!wlLoading && filteredWl.length > 0 && isMobile && (
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
            {hasMore ? (
              <button className="btn btn-outline" style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={() => setWlVisibleCount(c => c + WL_PER_PAGE)}>
                Tampilkan lebih banyak ({filteredWl.length - wlVisibleCount} tersisa)
              </button>
            ) : (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Semua {filteredWl.length} entri ditampilkan
              </span>
            )}
          </div>
        )}

        {/* Desktop: Pagination */}
        {!wlLoading && filteredWl.length > 0 && !isMobile && totalPages > 1 && (
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Menampilkan {(wlPage - 1) * WL_PER_PAGE + 1}–{Math.min(wlPage * WL_PER_PAGE, filteredWl.length)} dari {filteredWl.length} entri
            </span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                disabled={wlPage === 1} onClick={() => setWlPage(p => p - 1)}>‹ Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - wlPage) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) => p === '...'
                  ? <span key={`e${i}`} style={{ padding: '4px 6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>…</span>
                  : <button key={p} className={`btn ${p === wlPage ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '4px 10px', fontSize: '0.8rem', minWidth: '34px' }}
                      onClick={() => setWlPage(p)}>{p}</button>
                )}
              <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                disabled={wlPage === totalPages} onClick={() => setWlPage(p => p + 1)}>Next ›</button>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
