import { Plus, Search, Settings, Trash2, ShieldCheck, UserCheck, Users } from 'lucide-react'
import ClearableSearch from '../../components/ClearableSearch'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'

const STAFF_PER_PAGE = 10

export default function SystemUsersPage({
  systemStaff = [],
  staffSearch,
  setStaffSearch,
  staffPage,
  setStaffPage,
  rekapMonth,
  users = [],
  setStaffForm,
  setCurrentStaff,
  setIsStaffModalOpen,
  fetchData,
  setSelectedUsers,
  tenantKode = null,
}) {
  const { authHeader } = useAuthCtx()
  const { showToast, requestConfirm } = useUICtx()
  const filteredStaff = systemStaff.filter(s =>
    !staffSearch ||
    s.fullname?.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.username?.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.role?.toLowerCase().includes(staffSearch.toLowerCase())
  )
  const totalStaffPages = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PER_PAGE))
  const safeStaffPage = Math.min(staffPage, totalStaffPages)
  const pagedStaff = filteredStaff.slice((safeStaffPage - 1) * STAFF_PER_PAGE, safeStaffPage * STAFF_PER_PAGE)

  return (
    <div className="tab-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div className="page-title-area">
          <h1 className="page-title">Manajemen Staff & Akun</h1>
          <p className="page-description">Kelola hak akses teknisi, collector, dan administrator sistem dari satu pusat kendali.</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setStaffForm({ username: '', password: '', role: 'technician', fullname: '' })
          setCurrentStaff(null)
          setIsStaffModalOpen(true)
        }}>
          <Plus size={18} /><span>Tambah Staff Baru</span>
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-blue"><ShieldCheck size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{systemStaff.length}</div>
            <div className="stat-label">Total Akun Staff</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-success"><UserCheck size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{systemStaff.filter(s => s.role === 'admin').length}</div>
            <div className="stat-label">Administrator</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-yellow"><Users size={24} /></div>
          <div className="stat-info">
            <div className="stat-value">{systemStaff.filter(s => s.role !== 'admin').length}</div>
            <div className="stat-label">Teknisi / Collector</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Daftar Akun Sistem</h3>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={16} />
            <ClearableSearch value={staffSearch} onChange={e => { setStaffSearch(e.target.value); setStaffPage(1) }} placeholder="Cari staff..." style={{ width: '200px' }} />
          </div>
        </div>
        <div className="table-responsive" style={{ overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Nama Lengkap</th>
                <th>Username</th>
                <th>Role / Jabatan</th>
                <th>Tanggal Dibuat</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedStaff.length > 0 ? (
                pagedStaff.map(staff => (
                  <tr key={staff.id}>
                    <td data-label="Nama Lengkap">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '10px' }}>
                          {staff.fullname.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{staff.fullname}</div>
                      </div>
                    </td>
                    <td data-label="Username">
                      <code>{staff.username}</code>
                      {tenantKode && <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: '600' }}>@{tenantKode}</span>}
                    </td>
                    <td data-label="Role">
                      <span className={`badge ${staff.role === 'admin' ? 'badge-online' : staff.role === 'collector' ? 'badge-offline' : staff.role === 'noc' ? 'badge-purple' : 'badge-isolir'}`}
                        style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                        {staff.role}
                      </span>
                    </td>
                    <td data-label="Dibuat" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(staff.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </td>
                    <td data-label="Aksi" style={{ textAlign: 'right' }}>
                      <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title="Edit Staff" onClick={() => {
                          setStaffForm({ username: staff.username, role: staff.role, fullname: staff.fullname, new_password: '' })
                          setCurrentStaff(staff)
                          setIsStaffModalOpen(true)
                        }}><Settings size={16} /></button>
                        <button className="icon-btn" style={{ color: '#ef4444' }} title="Hapus Staff"
                          onClick={() => {
                            requestConfirm('Hapus Staff', `Yakin ingin menghapus staff ${staff.username}?`, async () => {
                              try {
                                const res = await fetch(`/api/system/users/${staff.id}`, {
                                  method: 'DELETE',
                                  headers: authHeader()
                                })
                                if (res.ok) {
                                  showToast('Staff berhasil dihapus', 'success')
                                  fetchData(true)
                                } else {
                                  const err = await res.json()
                                  showToast(err.error || 'Gagal menghapus staff', 'error')
                                }
                              } catch (e) { showToast('Terjadi kesalahan koneksi', 'error') }
                            }, 'danger')
                          }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                  {staffSearch ? 'Tidak ada staff yang cocok.' : 'Belum ada staff terdaftar.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStaff.length > STAFF_PER_PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {(safeStaffPage - 1) * STAFF_PER_PAGE + 1}–{Math.min(safeStaffPage * STAFF_PER_PAGE, filteredStaff.length)} of {filteredStaff.length}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safeStaffPage === 1} onClick={() => setStaffPage(1)}>«</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safeStaffPage === 1} onClick={() => setStaffPage(p => p - 1)}>‹</button>
              <button className="btn btn-primary" style={{ padding: '4px 10px', minWidth: '36px' }}>{safeStaffPage}</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safeStaffPage >= totalStaffPages} onClick={() => setStaffPage(p => p + 1)}>›</button>
              <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safeStaffPage >= totalStaffPages} onClick={() => setStaffPage(totalStaffPages)}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
