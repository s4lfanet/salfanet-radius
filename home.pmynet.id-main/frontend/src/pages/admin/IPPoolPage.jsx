import { Plus, Info, Database, Settings, Trash2 } from 'lucide-react'

export default function IPPoolPage({
  ipPools = [],
  setNewPool,
  setEditingPool,
  setShowAddPoolModal,
  prepareEditPool,
  handleDeletePool,
}) {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen IP Pool</h1>
          <p className="page-description">Daftar nama IP Pool dari MikroTik sebagai referensi untuk profil kecepatan.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setNewPool({ pool_name: '', description: '' }); setEditingPool(null); setShowAddPoolModal(true); }}>
          <Plus size={18} />
          <span>Tambah IP Pool</span>
        </button>
      </div>

      <div style={{ padding: '1rem 1.5rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '1px' }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
          <strong>IP Pool dikelola oleh MikroTik.</strong> Di sini kamu hanya mendaftarkan <em>nama</em> pool sebagai referensi.
          Nama yang sama harus sesuai dengan nama IP Pool yang ada di MikroTik. Pool ini dipakai sebagai pilihan saat mengatur profil kecepatan pelanggan.
        </div>
      </div>

      <section className="card">
        <div style={{ padding: '0', overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Nama Pool</th>
                <th>Keterangan</th>
                <th>Ditambahkan</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {ipPools.map(p => (
                <tr key={p.pool_name}>
                  <td data-label="Nama Pool">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="icon-badge" style={{ backgroundColor: 'var(--primary-color)', color: '#fff' }}>
                        <Database size={16} />
                      </div>
                      <span style={{ fontWeight: '600', fontSize: '0.9375rem', fontFamily: 'monospace' }}>{p.pool_name}</span>
                    </div>
                  </td>
                  <td data-label="Keterangan">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{p.description || '-'}</span>
                  </td>
                  <td data-label="Ditambahkan">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                    </span>
                  </td>
                  <td data-label="Aksi">
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="icon-btn-sm" title="Edit Pool" onClick={() => prepareEditPool(p)}>
                        <Settings size={16} />
                      </button>
                      <button className="icon-btn-sm" title="Hapus Pool" style={{ color: '#ef4444' }} onClick={() => handleDeletePool(p.pool_name)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ipPools.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <Database size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <div>Belum ada IP Pool terdaftar. Klik "Tambah IP Pool" untuk menambahkan.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
