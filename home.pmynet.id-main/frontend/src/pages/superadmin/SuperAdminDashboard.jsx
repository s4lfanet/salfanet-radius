import { useState, useEffect, useCallback } from 'react'
import { Building2, Users, UserCheck, UserX, BarChart2, TrendingUp, RefreshCw, Eye } from 'lucide-react'
import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

function StatCard({ icon, label, value, color, sub, onClick }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s', flex: '1', minWidth: 140 }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      {icon}
      <div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function SuperAdminDashboard() {
  const { authHeader } = useAuthCtx()
  const { showToast } = useUICtx()
  const { navigateTo } = useNavCtx()

  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tenants', { headers: authHeader() })
      if (!res.ok) throw new Error('Gagal memuat data mitra')
      setTenants(await res.json())
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  const aktif    = tenants.filter(t => t.status === 'aktif')
  const nonaktif = tenants.filter(t => t.status === 'nonaktif')
  const berhenti = tenants.filter(t => t.status === 'berhenti')
  const totalPelanggan = tenants.reduce((a, t) => a + (t.total_pelanggan || 0), 0)
  const totalStaff = tenants.reduce((a, t) => a + (t.total_staff || 0), 0)

  const topMitra = [...tenants]
    .sort((a, b) => (b.total_pelanggan || 0) - (a.total_pelanggan || 0))
    .slice(0, 10)

  const maxPelanggan = topMitra[0]?.total_pelanggan || 1

  return (
    <div className="tab-content animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-title-area">
          <h1 className="page-title">Dashboard Super Admin</h1>
          <p className="page-description">Ringkasan platform — semua ISP mitra terdaftar.</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchTenants} disabled={loading}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <StatCard
          icon={<Building2 size={22} style={{ color: 'var(--accent)' }} />}
          label="Total Mitra"
          value={loading ? '—' : tenants.length}
          onClick={() => navigateTo('sa_mitra', null, 'semua')}
        />
        <StatCard
          icon={<UserCheck size={22} style={{ color: 'var(--success)' }} />}
          label="Mitra Aktif"
          value={loading ? '—' : aktif.length}
          color="var(--success)"
          onClick={() => navigateTo('sa_mitra', null, 'aktif')}
        />
        <StatCard
          icon={<UserX size={22} style={{ color: 'var(--warning)' }} />}
          label="Non-Aktif"
          value={loading ? '—' : nonaktif.length}
          color="var(--warning)"
          onClick={() => navigateTo('sa_mitra', null, 'nonaktif')}
        />
        <StatCard
          icon={<UserX size={22} style={{ color: 'var(--danger)' }} />}
          label="Berhenti"
          value={loading ? '—' : berhenti.length}
          color="var(--danger)"
          onClick={() => navigateTo('sa_mitra', null, 'berhenti')}
        />
        <StatCard
          icon={<Users size={22} style={{ color: 'var(--accent)' }} />}
          label="Total Pelanggan"
          value={loading ? '—' : totalPelanggan.toLocaleString('id-ID')}
          sub={`${totalStaff} staff terdaftar`}
        />
      </div>

      {/* Top Mitra */}
      <div className="card">
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Peringkat Mitra by Jumlah Pelanggan</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Top {Math.min(10, tenants.length)}</span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div>
        ) : topMitra.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada mitra terdaftar</div>
        ) : (
          <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {topMitra.map((t, i) => {
              const pct = Math.max(3, Math.round(((t.total_pelanggan || 0) / maxPelanggan) * 100))
              const statusColor = t.status === 'aktif' ? 'var(--success)' : t.status === 'berhenti' ? 'var(--danger)' : 'var(--warning)'
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ width: 20, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nama}</span>
                      <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>{t.kode}</span>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, marginLeft: 'auto' }} title={t.status} />
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: t.status === 'aktif' ? 'var(--accent)' : statusColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
                    {(t.total_pelanggan || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent / All mitra quick table */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Semua Mitra</span>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => navigateTo('sa_mitra', null, 'semua')}
          >
            <Eye size={14} /><span>Lihat Semua</span>
          </button>
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Mitra</th>
                  <th>Kontak</th>
                  <th style={{ textAlign: 'center' }}>Staff</th>
                  <th style={{ textAlign: 'center' }}>Pelanggan</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Belum ada mitra</td></tr>
                )}
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td><span style={{ fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.82rem' }}>{t.kode}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.nama}</div>
                      {t.alamat && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.alamat}</div>}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{t.kontak || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</div>
                      {t.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.phone}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{t.total_staff || 0}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{(t.total_pelanggan || 0).toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge ${
                        t.status === 'aktif' ? 'status-online' :
                        t.status === 'berhenti' ? 'status-offline' : 'status-suspended'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
