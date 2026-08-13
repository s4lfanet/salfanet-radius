import { MapPin, User } from 'lucide-react'

export default function TerritoriesPage({
  systemStaff = [],
  collectorAreas = [],
  expandedCollectors,
  setExpandedCollectors,
  openAssignDusunModal,
  handleRemoveCollectorArea,
}) {
  const collectors = systemStaff.filter(s => s.role === 'collector')

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin size={24} className="text-primary" />
            Manajemen Wilayah
          </h1>
          <p className="page-description">Assign dusun/kampung ke kolektor. Satu dusun hanya bisa dipegang satu kolektor.</p>
        </div>
      </div>

      {collectors.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <User size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
          <div style={{ fontWeight: '500' }}>Belum ada kolektor terdaftar.</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Tambahkan staff dengan role Collector terlebih dahulu di menu Staff.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {collectors.map(col => {
            const myAreas = collectorAreas.filter(a => String(a.collector_id) === String(col.id))
            const byKel = {}
            myAreas.forEach(a => {
              const key = a.kelurahan_kode
              if (!byKel[key]) byKel[key] = { kelNama: a.kelurahan_nama, kecNama: a.kecamatan_nama, kabNama: a.kabupaten_nama, dusun: [] }
              byKel[key].dusun.push(a)
            })
            const kelList = Object.values(byKel)

            return (
              <div key={col.id} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '1.1rem', flexShrink: 0 }}>
                    {(col.fullname || col.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.fullname || col.username}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{col.username}</div>
                  </div>
                  <span className={`badge ${myAreas.length > 0 ? 'badge-online' : 'badge-offline'}`} style={{ fontSize: '0.68rem', flexShrink: 0 }}>
                    {myAreas.length > 0 ? `${myAreas.length} DUSUN` : 'BELUM ADA'}
                  </span>
                </div>

                {kelList.length > 0 ? (() => {
                  const isExpanded = expandedCollectors.has(col.id)
                  const toggleExpand = () => setExpandedCollectors(prev => {
                    const next = new Set(prev)
                    if (next.has(col.id)) next.delete(col.id)
                    else next.add(col.id)
                    return next
                  })
                  return (
                    <div>
                      {!isExpanded ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {kelList.map((kel, ki) => (
                            <div key={ki} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: 'var(--bg-secondary)', borderRadius: '7px', fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{kel.kelNama}</span>
                                {kel.kecNama ? <span style={{ color: 'var(--text-muted)' }}>, {kel.kecNama}</span> : ''}
                              </span>
                              <span style={{ background: 'var(--primary-color)', color: '#fff', borderRadius: '12px', padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700, marginLeft: '8px', flexShrink: 0 }}>
                                {kel.dusun.length} dusun
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {kelList.map((kel, ki) => (
                            <div key={ki} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.6rem 0.85rem' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                                {kel.kelNama}{kel.kecNama ? `, ${kel.kecNama}` : ''}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {kel.dusun.map(a => (
                                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', padding: '2px 6px 2px 8px', borderRadius: '20px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <span style={{ fontWeight: '600' }}>{a.dusun_nama}</span>
                                    <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 0 0 2px', lineHeight: 1, fontSize: '0.8rem' }}
                                      title={`Hapus ${a.dusun_nama}`}
                                      onClick={() => handleRemoveCollectorArea(a.id, a.dusun_nama)}>×</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button"
                        onClick={toggleExpand}
                        style={{ marginTop: '6px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        {isExpanded ? '▲ Sembunyikan detail' : `▼ Lihat ${myAreas.length} dusun`}
                      </button>
                    </div>
                  )
                })() : (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={13} /><span>Belum ada dusun yang di-assign.</span>
                  </div>
                )}

                <button className="btn" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)' }}
                  onClick={() => openAssignDusunModal(col.id)}>
                  <MapPin size={14} /><span>Assign Dusun/Kampung</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
