import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Edit2, ToggleLeft, ToggleRight, StopCircle, Building2, Users, UserCheck, Search, X } from 'lucide-react'
import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'

const EMPTY_FORM = { kode: '', nama: '', kontak: '', phone: '', email: '', alamat: '', admin_username: '', admin_password: '' }

export default function TenantManagementPage({ statusFilter = 'semua' }) {
  const { authHeader } = useAuthCtx()
  const { showToast, requestConfirm } = useUICtx()

  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants', { headers: authHeader() })
      if (!res.ok) throw new Error('Gagal mengambil data mitra')
      setTenants(await res.json())
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  const openAdd = () => {
    setEditingTenant(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = async (t) => {
    setEditingTenant(t)
    setForm({ kode: t.kode, nama: t.nama, kontak: t.kontak || '', phone: t.phone || '', email: t.email || '', alamat: t.alamat || '', admin_username: '', admin_password: '' })
    setModalOpen(true)
    // Ambil username admin yang aktif
    try {
      const res = await fetch(`/api/tenants/${t.id}/admin`, { headers: authHeader() })
      if (res.ok) {
        const data = await res.json()
        setForm(f => ({ ...f, admin_username: data.admin_username || '' }))
      }
    } catch {}
  }

  const handleSave = async () => {
    if (!form.kode || !form.nama) return showToast('Kode dan nama wajib diisi', 'error')
    if (!editingTenant && (!form.admin_username || !form.admin_password)) return showToast('Username dan password admin wajib diisi', 'error')
    setSaving(true)
    try {
      const url = editingTenant ? `/api/tenants/${editingTenant.id}` : '/api/tenants'
      const method = editingTenant ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan')
      showToast(data.message, 'success')
      setModalOpen(false)
      fetchTenants()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSetStatus = async (t, newStatus) => {
    if (t.id === 1) return showToast('Tenant pusat tidak bisa diubah statusnya', 'error')
    const labels = { aktif: 'Aktifkan', nonaktif: 'Nonaktifkan', berhenti: 'Hentikan' }
    requestConfirm(`${labels[newStatus]} mitra "${t.nama}"?`, `Status mitra akan diubah menjadi ${newStatus}.`, async () => {
      try {
        const res = await fetch(`/api/tenants/${t.id}/status`, {
          method: 'PATCH',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        showToast(data.message, 'success')
        fetchTenants()
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  }

  const byStatus = statusFilter === 'semua' ? tenants : tenants.filter(t => t.status === statusFilter)
  const filtered = byStatus.filter(t =>
    !search ||
    t.nama?.toLowerCase().includes(search.toLowerCase()) ||
    t.kode?.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const statusLabels = { semua: 'Semua Mitra', aktif: 'Mitra Aktif', nonaktif: 'Mitra Non-Aktif', berhenti: 'Mitra Berhenti' }

  return (
    <div className="tab-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-title-area">
          <h1 className="page-title">{statusLabels[statusFilter] || 'Manajemen Mitra'}</h1>
          <p className="page-description">Kelola semua ISP mitra yang terdaftar dalam platform ini.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} /><span>Tambah Mitra</span>
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: '1', minWidth: 140 }}>
          <Building2 size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{tenants.length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Mitra</div>
          </div>
        </div>
        <div className="stat-card" style={{ flex: '1', minWidth: 140 }}>
          <UserCheck size={20} style={{ color: 'var(--success)' }} />
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{tenants.filter(t => t.status === 'aktif').length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mitra Aktif</div>
          </div>
        </div>
        <div className="stat-card" style={{ flex: '1', minWidth: 140 }}>
          <Users size={20} style={{ color: 'var(--warning)' }} />
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{tenants.reduce((a, t) => a + (t.total_pelanggan || 0), 0).toLocaleString()}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Pelanggan</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem', position: 'relative', maxWidth: 320 }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        <input
          className="search-input"
          style={{ paddingLeft: 34, width: '100%' }}
          placeholder="Cari nama, kode, email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Mitra</th>
                  <th>Kontak</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'center' }}>Staff</th>
                  <th style={{ textAlign: 'center' }}>Pelanggan</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    {search ? 'Tidak ada hasil pencarian' : `Tidak ada mitra${statusFilter !== 'semua' ? ` ${statusFilter}` : ''}`}
                  </td></tr>
                )}
                {paginated.map(t => (
                  <tr key={t.id}>
                    <td><span style={{ fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.85rem' }}>{t.kode}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.nama}</div>
                      {t.alamat && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t.alamat}</div>}
                    </td>
                    <td>
                      <div>{t.kontak || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</div>
                      {t.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.phone}</div>}
                    </td>
                    <td>{t.email || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}>{t.total_staff || 0}</td>
                    <td style={{ textAlign: 'center' }}>{(t.total_pelanggan || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge ${
                        t.status === 'aktif' ? 'status-online' :
                        t.status === 'berhenti' ? 'status-offline' : 'status-suspended'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} title="Edit" disabled={t.id === 1}>
                          <Edit2 size={14} />
                        </button>
                        {t.status !== 'aktif' && (
                          <button className="btn btn-sm btn-success" onClick={() => handleSetStatus(t, 'aktif')} title="Aktifkan" disabled={t.id === 1}>
                            <ToggleRight size={14} />
                          </button>
                        )}
                        {t.status === 'aktif' && (
                          <button className="btn btn-sm btn-warning" onClick={() => handleSetStatus(t, 'nonaktif')} title="Nonaktifkan" disabled={t.id === 1}>
                            <ToggleLeft size={14} />
                          </button>
                        )}
                        {t.status !== 'berhenti' && t.id !== 1 && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleSetStatus(t, 'berhenti')} title="Hentikan mitra">
                            <StopCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {filtered.length} mitra · halaman {page} dari {totalPages}
          </span>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
          </div>
        </div>
      )}

      {/* Modal — pakai createPortal agar tidak terikat pada transform parent */}
      {modalOpen && createPortal(
        <div className="modal-overlay animate-fade-in" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingTenant ? 'Edit Mitra' : 'Tambah Mitra Baru'}</h2>
              <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={22} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.25rem 0 1.5rem' }}>
              <div className="form-group">
                <label>Kode Mitra <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Contoh: MT001"
                  value={form.kode}
                  onChange={e => setForm(f => ({ ...f, kode: e.target.value.toUpperCase() }))}
                  disabled={!!editingTenant}
                  maxLength={20}
                />
                {!editingTenant && <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Kode unik, tidak bisa diubah setelah disimpan</small>}
              </div>

              <div className="form-group">
                <label>Nama Mitra <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Nama ISP mitra" value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Nama Kontak</label>
                  <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="PIC / penanggung jawab" value={form.kontak} onChange={e => setForm(f => ({ ...f, kontak: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>No. HP</label>
                  <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="08xx..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} type="email" placeholder="email@mitra.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              <div className="form-group">
                <label>Alamat</label>
                <textarea className="search-input" rows={3} placeholder="Alamat kantor mitra" value={form.alamat} onChange={e => setForm(f => ({ ...f, alamat: e.target.value }))} style={{ width: '100%', padding: '0.5rem 1rem', resize: 'vertical', height: 'auto' }} />
              </div>

              {true && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.5rem' }}>Akun Admin Mitra</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label>Username Admin {!editingTenant && <span style={{ color: '#ef4444' }}>*</span>}</label>
                      <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Contoh: admin" value={form.admin_username} onChange={e => setForm(f => ({ ...f, admin_username: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Password {!editingTenant ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span>}</label>
                      <input className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} type="password" placeholder={editingTenant ? 'Kosongkan jika tidak diubah' : 'Min. 6 karakter'} value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} />
                    </div>
                  </div>
                  <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: -8 }}>
                    Login mitra: <strong>{form.admin_username || 'username'}@{(form.kode || 'kode').toLowerCase()}</strong>
                  </small>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan...' : editingTenant ? 'Simpan Perubahan' : 'Tambah Mitra'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
