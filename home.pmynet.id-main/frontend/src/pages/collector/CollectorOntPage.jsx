import { Unplug, Activity } from 'lucide-react'

export default function CollectorOntPage({ ontRemovals = [], ontRemovalsMeta = {}, fetchOntRemovals }) {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Unplug size={22} style={{ color: '#ef4444' }} /> Riwayat Cabut ONT
          </h1>
          <p className="page-description">Rekap pencabutan perangkat yang kamu lakukan.</p>
        </div>
        <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={fetchOntRemovals}>
          <Activity size={15} /> Refresh
        </button>
      </div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><Unplug size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Bulan Ini</span>
            <span className="stat-value" style={{ color: '#ef4444' }}>{ontRemovalsMeta.thisMonth}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper stat-icon-primary"><Unplug size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Bulan Lalu</span>
            <span className="stat-value">{ontRemovalsMeta.lastMonth}</span>
          </div>
        </div>
      </div>
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {ontRemovals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Unplug size={36} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />Belum ada riwayat pencabutan ONT.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.25rem' }}>Pelanggan</th>
                  <th>Dusun</th>
                  <th>Catatan</th>
                  <th>Waktu Cabut</th>
                </tr>
              </thead>
              <tbody>
                {ontRemovals.map(r => (
                  <tr key={r.id}>
                    <td data-label="Pelanggan" style={{ paddingLeft: '1.25rem' }}>
                      <div style={{ fontWeight: '600' }}>{r.fullname || r.username}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.customer_id || r.username}</div>
                    </td>
                    <td data-label="Dusun" style={{ fontSize: '0.82rem' }}>{r.dusun || '—'}</td>
                    <td data-label="Catatan" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.notes || '—'}</td>
                    <td data-label="Waktu" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(r.removed_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
