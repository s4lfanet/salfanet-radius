import { useState } from 'react'
import { Users, UserCheck, Activity, AlertCircle, ClipboardList, Plus, Unplug, CheckCircle, Eye, XCircle } from 'lucide-react'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

export default function TechnicianDashboardPage({
  users = [],
  ontTasks = [],
  setShowAddUserModal,
  setViewingUser,
  setShowUserDetailModal,
  setOntCompleteTarget,
  setOntCompleteNotes,
  setShowOntCompleteModal,
  wlAssignedCount = 0,
}) {
  const { currentUser, authHeader } = useAuthCtx()
  const { showToast } = useUICtx()
  const { navigateTo } = useNavCtx()

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)

  const openCancelModal = (task) => { setCancelTarget(task); setCancelReason(''); setShowCancelModal(true) }

  const submitCancelOnt = async () => {
    if (!cancelReason.trim()) return showToast('Alasan pembatalan wajib diisi', 'error')
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/ont-removal-tasks/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_reason: cancelReason.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message || 'Task dibatalkan', 'success')
      setShowCancelModal(false)
      // Reload halaman agar list task terupdate
      window.location.reload()
    } catch (err) { showToast(err.message, 'error') }
    finally { setCancelLoading(false) }
  }

  const myUsers = users.filter(u => u.created_by_id === currentUser?.id)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const myThisMonth = myUsers.filter(u => u.created_at && u.created_at.slice(0, 7) === currentMonth)
  const myOnline = myUsers.filter(u => u.is_online)
  const myOffline = myUsers.filter(u => !u.is_online && !u.is_suspended)
  const myIsolir = myUsers.filter(u => u.is_suspended)
  const recentInstalls = [...myUsers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)

  return (
    <div className="animate-fade-in">
      <div className="page-header tech-dashboard-header">
        <div>
          <h1 className="page-title">Dashboard PSB</h1>
          <p className="page-description">Rekap pemasangan baru dan status pelanggan yang kamu daftarkan.</p>
        </div>
        <div className="tech-header-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowAddUserModal(true)}>
            <Plus size={16} /> PSB Baru
          </button>
          <button className="btn btn-outline" onClick={(e) => navigateTo('waiting_list', e)} style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            <ClipboardList size={16} /> Waiting List
            {wlAssignedCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '700', padding: '1px 6px', lineHeight: 1.4 }}>
                {wlAssignedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-primary"><Users size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Pasang Saya</span>
            <span className="stat-value">{myUsers.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pelanggan</small></span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-green"><UserCheck size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Pasang Bulan Ini</span>
            <span className="stat-value" style={{ color: '#10b981' }}>{myThisMonth.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Baru</small></span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-success"><Activity size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Aktif / Online</span>
            <span className="stat-value" style={{ color: '#22c55e' }}>{myOnline.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Online</small></span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-yellow"><AlertCircle size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Offline / Isolir</span>
            <span className="stat-value" style={{ color: '#f59e0b' }}>{myOffline.length + myIsolir.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tidak Aktif</small></span>
          </div>
        </div>
      </section>

      {/* Card Task Cabut ONT */}
      {ontTasks.length > 0 && (
        <section className="card" style={{ marginTop: '1.5rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.03)' }}>
          <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
            <h2 className="card-title" style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
              <Unplug size={18} /> Task Cabut ONT
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', fontSize: '0.7rem', fontWeight: '700', padding: '1px 8px' }}>
                {ontTasks.length}
              </span>
            </h2>
          </div>
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {ontTasks.map(task => {
              const taskUser = users.find(u => u.username === task.username)
              return (
                <div key={task.id} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{task.fullname}</div>
                      {task.address && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{task.address}</div>}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{task.territory_name || 'Umum'}</div>
                      {task.notes && (
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px', fontStyle: 'italic' }}>
                          📝 {task.notes}
                        </div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Ditugaskan oleh {task.assigned_by} · {new Date(task.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn" style={{ padding: '6px 14px', fontSize: '0.78rem', background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => { setOntCompleteTarget(task); setOntCompleteNotes(''); setShowOntCompleteModal(true) }}>
                        <CheckCircle size={14} /> Selesai
                      </button>
                      <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '0.78rem', color: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => openCancelModal(task)}>
                        <XCircle size={14} /> Batal
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-color)' }}>
                    <a
                      href={task.latitude && task.longitude
                        ? `https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`
                        : `https://www.google.com/maps/search/${encodeURIComponent(task.address || task.fullname)}`}
                      target="_blank" rel="noreferrer"
                      className="btn btn-outline"
                      style={{ flex: 1, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', color: '#2563eb', borderColor: '#2563eb', textDecoration: 'none', padding: '6px 0' }}>
                      🧭 Navigasi
                    </a>
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1, fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px 0' }}
                      onClick={() => { if (taskUser) { setViewingUser(taskUser); setShowUserDetailModal(true) } else showToast('Data pelanggan tidak tersedia', 'warning') }}>
                      <Eye size={14} /> Detail
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Tabel Pemasangan Terbaru */}
      <section className="card tech-installs-table" style={{ marginTop: '2rem', padding: '0', overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClipboardList size={20} className="text-primary" /> Pemasangan Terbaru
          </h2>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => navigateTo('pelanggan', null, 'all')}>
            Lihat Semua
          </button>
        </div>
        {recentInstalls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Users size={40} style={{ opacity: 0.15, marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 600 }}>Belum ada pemasangan</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Klik "PSB Baru" untuk mendaftarkan pelanggan pertama.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.5rem' }}>PELANGGAN</th>
                  <th>PAKET</th>
                  <th>STATUS</th>
                  <th>TGL PASANG</th>
                  <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {recentInstalls.map(u => (
                  <tr key={u.username} style={{ cursor: 'pointer' }} onClick={() => { setViewingUser(u); setShowUserDetailModal(true); }}>
                    <td data-label="Pelanggan" style={{ paddingLeft: '1.5rem' }}>
                      <div style={{ fontWeight: '600' }}>{u.fullname || u.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.username}</div>
                    </td>
                    <td data-label="Paket">
                      <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{u.groupname || '-'}</span>
                    </td>
                    <td data-label="Status">
                      {u.is_online
                        ? <span className="badge badge-online">ONLINE</span>
                        : u.is_suspended
                          ? <span className="badge badge-isolir">ISOLIR</span>
                          : <span className="badge badge-offline">OFFLINE</span>
                      }
                    </td>
                    <td data-label="Tgl Pasang" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td data-label="Aksi" style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title="Detail" onClick={e => { e.stopPropagation(); setViewingUser(u); setShowUserDetailModal(true); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Batalkan Task Cabut ONT */}
      {showCancelModal && cancelTarget && (
        <div className="modal-overlay" onClick={() => !cancelLoading && setShowCancelModal(false)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <XCircle size={18} /> Batalkan Task Cabut ONT
              </h3>
              <button className="modal-close" onClick={() => setShowCancelModal(false)} disabled={cancelLoading}>✕</button>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: '700' }}>{cancelTarget.fullname}</div>
                {cancelTarget.address && <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{cancelTarget.address}</div>}
              </div>
              <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Alasan Pembatalan <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                className="search-input"
                style={{ width: '100%', minHeight: '100px', resize: 'vertical', padding: '0.65rem 0.875rem', fontFamily: 'inherit', fontSize: '0.88rem' }}
                placeholder="Jelaskan alasan pembatalan task ini..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCancelModal(false)} disabled={cancelLoading}>
                  Kembali
                </button>
                <button className="btn" style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                  onClick={submitCancelOnt} disabled={cancelLoading || !cancelReason.trim()}>
                  {cancelLoading ? 'Membatalkan...' : 'Batalkan Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
