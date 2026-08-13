import { RefreshCw, Unplug, Eye, X, Activity, History, Users } from 'lucide-react'

export default function AdminOntTasksPage({
  adminOntTasks = [],
  adminOntTasksFilter,
  adminOntTasksLoading,
  setAdminOntTasksFilter,
  fetchAdminOntTasks,
  adminOntMonthly = [],
  adminOntByCollector = [],
  adminOntRemovals = [],
  adminOntLoading,
  adminOntFilter,
  setAdminOntFilter,
  fetchAdminOntRemovals,
  users = [],
  setViewingUser,
  setShowUserDetailModal,
  cancelOntTask,
}) {
  const statusLabel = { pending: 'Pending', done: 'Selesai', cancelled: 'Dibatalkan' }
  const statusBadge = {
    pending:   { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    done:      { bg: 'rgba(16,185,129,0.12)',   color: '#10b981', border: 'rgba(16,185,129,0.3)' },
    cancelled: { bg: 'rgba(107,114,128,0.12)',  color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
  }
  const countByStatus = (s) => adminOntTasks.filter(t => t.status === s).length
  const allPending = users.filter(u => u.has_ont_task).length

  return (
    <div className="tab-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Cabut ONT</h1>
          <p className="page-description">Pantau dan kelola semua penugasan pencabutan perangkat ONT.</p>
        </div>
        <button className="btn btn-primary" onClick={() => fetchAdminOntTasks(adminOntTasksFilter)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <section className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {['pending','done','cancelled'].map(s => (
          <div key={s} className="stat-card" style={{ cursor: 'pointer', outline: adminOntTasksFilter === s ? `2px solid ${statusBadge[s].color}` : 'none' }}
            onClick={() => { setAdminOntTasksFilter(s); fetchAdminOntTasks(s) }}>
            <div className="stat-info">
              <span className="stat-label">{statusLabel[s]}</span>
              <span className="stat-value" style={{ color: statusBadge[s].color }}>
                {s === 'pending' ? allPending : countByStatus(s)}
              </span>
            </div>
          </div>
        ))}
        <div className="stat-card" style={{ cursor: 'pointer', outline: adminOntTasksFilter === 'all' ? '2px solid var(--primary-color)' : 'none' }}
          onClick={() => { setAdminOntTasksFilter('all'); fetchAdminOntTasks('all') }}>
          <div className="stat-info">
            <span className="stat-label">Semua</span>
            <span className="stat-value">{adminOntTasks.length}</span>
          </div>
        </div>
      </section>

      <section className="card">
        {adminOntTasksLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data...</div>
        ) : adminOntTasks.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Unplug size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
            <div>Tidak ada task {adminOntTasksFilter !== 'all' ? statusLabel[adminOntTasksFilter]?.toLowerCase() : ''}</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.25rem' }}>Pelanggan</th>
                  <th>Teknisi</th>
                  <th>Wilayah</th>
                  <th>Catatan</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {adminOntTasks.map(task => {
                  const sb = statusBadge[task.status] || statusBadge.cancelled
                  const taskUser = users.find(u => u.username === task.username)
                  return (
                    <tr key={task.id}>
                      <td data-label="Pelanggan" style={{ paddingLeft: '1.25rem' }}>
                        <div style={{ fontWeight: '600' }}>{task.fullname || task.username}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{task.username}</div>
                      </td>
                      <td data-label="Teknisi">
                        <div style={{ fontSize: '0.82rem' }}>{task.technician_name || task.assigned_to}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Oleh: {task.assigned_by}</div>
                      </td>
                      <td data-label="Wilayah" style={{ fontSize: '0.82rem' }}>{task.territory_name || '-'}</td>
                      <td data-label="Catatan" style={{ fontSize: '0.8rem', color: task.notes ? 'var(--text-primary)' : 'var(--text-muted)', maxWidth: '180px' }}>
                        {task.notes || '—'}
                      </td>
                      <td data-label="Tanggal" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(task.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {task.completed_at && (
                          <div style={{ color: '#10b981' }}>✓ {new Date(task.completed_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</div>
                        )}
                      </td>
                      <td data-label="Status">
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: '700', background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>
                          {statusLabel[task.status] || task.status}
                        </span>
                      </td>
                      <td data-label="Aksi" style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {taskUser && (
                            <button className="icon-btn" title="Detail Pelanggan" onClick={() => { setViewingUser(taskUser); setShowUserDetailModal(true) }}>
                              <Eye size={15} />
                            </button>
                          )}
                          {task.status === 'pending' && (
                            <button className="icon-btn" title="Batalkan Task" style={{ color: '#ef4444' }} onClick={() => cancelOntTask(task.id)}>
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ──────────── Rekap Cabut ONT ──────────── */}
      <section className="card" style={{ marginTop: '1.5rem', overflow: 'hidden' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Unplug size={18} style={{ color: '#ef4444' }} /> Rekap Cabut ONT / Router
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pencabutan perangkat oleh kolektor, per bulan</p>
          </div>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => fetchAdminOntRemovals(adminOntFilter)}>
            <Activity size={13} />Refresh
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* Summary cards */}
          {(() => {
            const thisM = new Date().toISOString().slice(0, 7)
            const lastM = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })()
            const thisData = adminOntMonthly.find(m => m.period === thisM)
            const lastData = adminOntMonthly.find(m => m.period === lastM)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div className="stat-card" style={{ padding: '1rem 1.25rem', gap: '0.85rem', minWidth: 0 }}>
                  <div className="stat-icon-wrapper stat-icon-pink" style={{ width: 40, height: 40, flexShrink: 0 }}><Unplug size={18} /></div>
                  <div className="stat-info" style={{ minWidth: 0 }}>
                    <span className="stat-label">Bulan Ini</span>
                    <span className="stat-value" style={{ color: '#ef4444', fontSize: '1.5rem' }}>{thisData?.total || 0}</span>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>pencabutan ONT</small>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem 1.25rem', gap: '0.85rem', minWidth: 0 }}>
                  <div className="stat-icon-wrapper" style={{ width: 40, height: 40, flexShrink: 0, background: 'var(--bg-secondary)' }}><History size={18} /></div>
                  <div className="stat-info" style={{ minWidth: 0 }}>
                    <span className="stat-label">Bulan Lalu</span>
                    <span className="stat-value" style={{ fontSize: '1.5rem' }}>{lastData?.total || 0}</span>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>pencabutan ONT</small>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '1rem 1.25rem', gap: '0.85rem', minWidth: 0 }}>
                  <div className="stat-icon-wrapper stat-icon-yellow" style={{ width: 40, height: 40, flexShrink: 0 }}><Users size={18} /></div>
                  <div className="stat-info" style={{ minWidth: 0 }}>
                    <span className="stat-label">Kolektor Aktif</span>
                    <span className="stat-value" style={{ color: '#f59e0b', fontSize: '1.5rem' }}>{adminOntByCollector.length}</span>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>kolektor bulan ini</small>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Per-collector breakdown */}
          {adminOntByCollector.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Rekap Per Kolektor — Bulan Ini</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {adminOntByCollector.map(c => (
                  <div key={c.collector_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-primary)' }}>{c.collector_name}</span>
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: '12px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: '700' }}>{c.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Periode</label>
              <input type="month" className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                value={adminOntFilter.period}
                onChange={e => { const f = { ...adminOntFilter, period: e.target.value }; setAdminOntFilter(f); fetchAdminOntRemovals(f) }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Kolektor</label>
              <select className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                value={adminOntFilter.collector_id}
                onChange={e => { const f = { ...adminOntFilter, collector_id: e.target.value }; setAdminOntFilter(f); fetchAdminOntRemovals(f) }}>
                <option value="">Semua Kolektor</option>
                {adminOntByCollector.map(c => (
                  <option key={c.collector_id} value={c.collector_id}>{c.collector_name}</option>
                ))}
              </select>
            </div>
            {(adminOntFilter.period || adminOntFilter.collector_id) && (
              <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                onClick={() => { const f = { period: '', collector_id: '' }; setAdminOntFilter(f); fetchAdminOntRemovals(f) }}>
                Reset Filter
              </button>
            )}
          </div>

          {/* Detail table */}
          {adminOntLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Memuat data…</div>
          ) : adminOntRemovals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Belum ada data pencabutan ONT{adminOntFilter.period || adminOntFilter.collector_id ? ' untuk filter ini' : ''}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px' }}>Pelanggan</th>
                    <th style={{ padding: '8px 10px' }}>Dusun/Area</th>
                    <th style={{ padding: '8px 10px' }}>Kolektor</th>
                    <th style={{ padding: '8px 10px' }}>Tanggal Cabut</th>
                    <th style={{ padding: '8px 10px' }}>Periode</th>
                    <th style={{ padding: '8px 10px' }}>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {adminOntRemovals.map(r => (
                    <tr key={r.id}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: '600' }}>{r.fullname || r.username}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.customer_id || r.username}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{r.dusun || r.address || '-'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.78rem', border: '1px solid var(--border-color)' }}>
                          {r.collector_name}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(r.removed_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span className="badge badge-blue">{r.period}</span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                        <span style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>{r.notes || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                    <td colSpan={6} style={{ padding: '8px 10px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      Total: <strong>{adminOntRemovals.length}</strong> pencabutan ditampilkan
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
