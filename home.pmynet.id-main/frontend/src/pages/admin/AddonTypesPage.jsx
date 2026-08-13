import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Package, ToggleLeft, ToggleRight, X } from 'lucide-react'

export default function AddonTypesPage({ authHeader, showToast, requestConfirm }) {
  const [addons, setAddons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', price: '', is_recurring: true })
  const [saving, setSaving] = useState(false)

  const fetchAddons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/addon-types', { headers: authHeader() })
      if (res.ok) setAddons(await res.json())
    } catch (e) { showToast('Gagal memuat data', 'error') }
    finally { setLoading(false) }
  }, [authHeader, showToast])

  useEffect(() => { fetchAddons() }, [fetchAddons])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', price: '', is_recurring: true })
    setShowModal(true)
  }

  const openEdit = (addon) => {
    setEditing(addon)
    setForm({
      name: addon.name,
      description: addon.description || '',
      price: addon.price,
      is_recurring: !!addon.is_recurring,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return showToast('Nama addon wajib diisi', 'error')
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        is_recurring: form.is_recurring ? 1 : 0,
      }
      const url = editing ? `/api/addon-types/${editing.id}` : '/api/addon-types'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      showToast(editing ? 'Addon diperbarui' : 'Addon berhasil dibuat', 'success')
      setShowModal(false)
      fetchAddons()
    } catch (err) { showToast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const handleToggleActive = async (addon) => {
    try {
      await fetch(`/api/addon-types/${addon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ is_active: addon.is_active ? 0 : 1 }),
      })
      fetchAddons()
    } catch (e) { showToast('Gagal mengubah status', 'error') }
  }

  const handleDelete = (addon) => {
    requestConfirm(
      'Hapus Addon',
      `Hapus layanan tambahan "${addon.name}"? Jika masih digunakan pelanggan aktif, addon akan dinonaktifkan.`,
      async () => {
        try {
          const res = await fetch(`/api/addon-types/${addon.id}`, { method: 'DELETE', headers: authHeader() })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Gagal')
          showToast(data.message, 'success')
          fetchAddons()
        } catch (err) { showToast(err.message, 'error') }
      }
    )
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Layanan Tambahan</h1>
          <p className="page-subtitle">Kelola jenis layanan add-on (STB, IPTV, dll.) untuk pelanggan</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={fetchAddons} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Tambah Addon
          </button>
        </div>
      </div>

      <section className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat...</div>
        ) : addons.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Package size={40} style={{ marginBottom: '1rem', opacity: 0.4 }} />
            <p>Belum ada layanan tambahan.</p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openCreate}>
              <Plus size={16} /> Buat Addon Pertama
            </button>
          </div>
        ) : (
          <table className="modern-table">
            <thead>
              <tr>
                <th>Nama Layanan</th>
                <th>Keterangan</th>
                <th>Harga / Bulan</th>
                <th>Tipe</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {addons.map(a => (
                <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{a.description || '—'}</td>
                  <td style={{ fontWeight: 700 }}>Rp {Number(a.price).toLocaleString('id-ID')}</td>
                  <td>
                    <span className={`badge ${a.is_recurring ? 'badge-purple' : 'badge-online'}`}>
                      {a.is_recurring ? 'Bulanan' : 'Sekali'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.is_active ? '#10b981' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}
                    >
                      {a.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {a.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="inv-act-btn" onClick={() => openEdit(a)} title="Edit" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)' }}>
                        <Pencil size={14} />
                      </button>
                      <button className="inv-act-btn" onClick={() => handleDelete(a)} title="Hapus" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="stat-icon-wrapper stat-icon-primary" style={{ width: '36px', height: '36px', borderRadius: '10px' }}>
                  <Package size={18} />
                </div>
                <h2 className="modal-title">{editing ? 'Edit Layanan Tambahan' : 'Tambah Layanan Tambahan'}</h2>
              </div>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div className="form-group">
                <label className="form-label">Nama Layanan <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Misal: Sewa STB, IPTV Premium"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Keterangan <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
                <input
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '1rem' }}
                  placeholder="Deskripsi singkat layanan ini"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Harga (Rp)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>Rp</span>
                  <input
                    className="search-input"
                    style={{ width: '100%', paddingLeft: '2.5rem' }}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tipe Biaya</label>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
                  {[{ val: true, label: 'Bulanan (recurring)' }, { val: false, label: 'Sekali bayar' }].map(opt => (
                    <label key={String(opt.val)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                      padding: '0.5rem 1rem', borderRadius: '8px', flex: 1, justifyContent: 'center',
                      border: `1.5px solid ${form.is_recurring === opt.val ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      background: form.is_recurring === opt.val ? 'rgba(99,102,241,0.08)' : 'transparent',
                      fontSize: '0.85rem', fontWeight: form.is_recurring === opt.val ? 600 : 400,
                      color: form.is_recurring === opt.val ? 'var(--primary-color)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}>
                      <input type="radio" style={{ display: 'none' }} checked={form.is_recurring === opt.val} onChange={() => setForm(f => ({ ...f, is_recurring: opt.val }))} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
