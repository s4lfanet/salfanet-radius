// ─── Log Page ─────────────────────────────────────────────────────────────────

export default function LogPage({ logs = [] }) {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Riwayat Sesi</h1>
          <p className="page-description">Log aktivitas login dan penggunaan kuota pelanggan.</p>
        </div>
      </div>
      <section className="card">
        <div style={{ padding: '0', overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Login Time</th>
                <th>Data (Upload/Download)</th>
                <th>MAC Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td data-label="Username"><b style={{ color: 'var(--text-main)' }}>{l.username}</b></td>
                  <td data-label="Login Time">{new Date(l.login_time).toLocaleString()}</td>
                  <td data-label="Data">↑ {l.upload_mb} MB / ↓ {l.download_mb} MB</td>
                  <td data-label="MAC Address">{l.mac_address}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Belum ada data log aktivitas.
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
