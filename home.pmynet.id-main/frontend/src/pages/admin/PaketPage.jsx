import { Search, Package, Settings, Trash2, Plus } from 'lucide-react'
import ClearableSearch from '../../components/ClearableSearch'

import { useAuthCtx } from '../../context/AuthContext.jsx'

const PROFILE_PER_PAGE = 10

export default function PaketPage({
  profiles = [],
  profileSearch,
  setProfileSearch,
  profilePage,
  setProfilePage,
  profileSort,
  setProfileSort,
  mtConfigs = [],
  setEditingProfile,
  setNewProfile,
  setProfileSyncResults,
  setShowAddProfileModal,
  handleDeleteProfile,
  handleEditProfile,
}) {
  const { currentUser } = useAuthCtx()
  const SortIcon = ({ col }) => {
    if (profileSort.col !== col) return <span style={{ opacity: 0.25, fontSize: '0.7rem', marginLeft: 4 }}>↕</span>
    return <span style={{ fontSize: '0.7rem', marginLeft: 4, color: 'var(--primary-color)' }}>{profileSort.dir === 'asc' ? '↑' : '↓'}</span>
  }
  const handleSort = (col) => {
    setProfileSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))
    setProfilePage(1)
  }
  const thStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  const q = profileSearch.toLowerCase()
  let filtered = profiles.filter(p =>
    !q ||
    (p.name || '').toLowerCase().includes(q) ||
    (p.rate_limit || '').toLowerCase().includes(q) ||
    (p.pool_name || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  )
  if (profileSort.col) {
    filtered = [...filtered].sort((a, b) => {
      let va, vb
      if (profileSort.col === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase() }
      else if (profileSort.col === 'speed') { va = parseFloat((a.rate_limit || '0').split('/')[1]) || 0; vb = parseFloat((b.rate_limit || '0').split('/')[1]) || 0 }
      else if (profileSort.col === 'pool') { va = (a.pool_name || '').toLowerCase(); vb = (b.pool_name || '').toLowerCase() }
      else if (profileSort.col === 'price') { va = parseFloat(a.price) || 0; vb = parseFloat(b.price) || 0 }
      else if (profileSort.col === 'desc') { va = (a.description || '').toLowerCase(); vb = (b.description || '').toLowerCase() }
      if (va < vb) return profileSort.dir === 'asc' ? -1 : 1
      if (va > vb) return profileSort.dir === 'asc' ? 1 : -1
      return 0
    })
  }
  const totalPages = Math.ceil(filtered.length / PROFILE_PER_PAGE)
  const paginated = filtered.slice((profilePage - 1) * PROFILE_PER_PAGE, profilePage * PROFILE_PER_PAGE)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profil Paket & Harga</h1>
          <p className="page-description">Kelola batasan bandwidth dan harga bulanan paket internet.</p>
        </div>
        {currentUser?.role !== 'noc' && (
          <button className="btn btn-primary" onClick={() => {
            setEditingProfile(null)
            setNewProfile({ name: '', upload: '', download: '', price: '', description: '', ipPool: '', mikrotik_profile: '', routerOverrides: {} })
            setProfileSyncResults(null)
            setShowAddProfileModal(true)
          }}>
            <Plus size={18} /><span>Buat Profil Baru</span>
          </button>
        )}
      </div>
      <section className="card">
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320, display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1 }} />
            <ClearableSearch
              value={profileSearch}
              onChange={e => { setProfileSearch(e.target.value); setProfilePage(1) }}
              placeholder="Cari nama, kecepatan, pool, keterangan..."
              style={{ paddingLeft: '2.1rem', width: '100%' }}
            />
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} paket{profileSearch ? ` (dari ${profiles.length})` : ''}
          </span>
        </div>
        <div style={{ padding: '0', overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('name')}>Nama Paket <SortIcon col="name" /></th>
                <th style={thStyle} onClick={() => handleSort('speed')}>Kecepatan (Limit) <SortIcon col="speed" /></th>
                <th style={thStyle} onClick={() => handleSort('price')}>Harga Bulanan <SortIcon col="price" /></th>
                <th style={thStyle} onClick={() => handleSort('desc')}>Keterangan <SortIcon col="desc" /></th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="icon-badge" style={{ backgroundColor: 'var(--primary-color)', color: '#fff', padding: '6px', borderRadius: '8px' }}><Package size={18} /></div>
                      <div style={{ fontWeight: '600' }}>{p.name}</div>
                    </div>
                  </td>
                  <td><code className="code-badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.813rem' }}>{p.rate_limit}</code></td>
                  <td><span style={{ fontWeight: '600', color: '#16a34a' }}>Rp {Math.round(parseFloat(p.price) || 0).toLocaleString()}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{p.description || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {currentUser?.role !== 'noc' && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="icon-btn-sm" onClick={() => handleEditProfile(p, mtConfigs)}><Settings size={16} /></button>
                        <button className="icon-btn-sm danger" style={{ color: '#ef4444' }} onClick={() => handleDeleteProfile(p.id, p.name)}><Trash2 size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  {profileSearch ? `Tidak ada paket yang cocok dengan "${profileSearch}"` : 'Belum ada profil paket.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PROFILE_PER_PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {(profilePage - 1) * PROFILE_PER_PAGE + 1}–{Math.min(profilePage * PROFILE_PER_PAGE, filtered.length)} dari {filtered.length} paket
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.875rem' }}
                disabled={profilePage === 1} onClick={() => setProfilePage(p => p - 1)}>← Prev</button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`btn ${profilePage === i + 1 ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', minWidth: '36px' }}
                  onClick={() => setProfilePage(i + 1)}>{i + 1}</button>
              ))}
              <button className="btn btn-outline" style={{ padding: '0.4rem 0.9rem', fontSize: '0.875rem' }}
                disabled={profilePage === totalPages} onClick={() => setProfilePage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
