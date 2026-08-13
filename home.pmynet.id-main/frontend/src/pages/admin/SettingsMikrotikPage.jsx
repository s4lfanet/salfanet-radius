import { Activity, Plus, Eye, EyeOff, FileOutput, Settings, Trash2 } from 'lucide-react'

export default function SettingsMikrotikPage({
  mtLoading = false,
  mtConfigs = [],
  routerStatus = {},
  showRouterPass = {},
  setShowRouterPass,
  handleSyncRadius,
  setEditingMt,
  setNewMtConfig,
  setShowAddMtModal,
  openScriptModal,
  checkRouterStatus,
  prepareEditMt,
  handleDeleteRouter,
}) {

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan MikroTik</h1>
          <p className="page-description">Hubungkan router untuk kontrol terpusat.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" style={{ borderColor: 'var(--primary)' }} onClick={handleSyncRadius}>
            <Activity size={18} />
            <span>Sinkron & Reload RADIUS</span>
          </button>
          <button className="btn btn-primary" onClick={() => {
            setEditingMt(null)
            setNewMtConfig({ name: '', host: '', user: '', pass: '', port: 8728, radiusSecret: 'Mynet@2026', radiusNasIp: '' })
            setShowAddMtModal(true)
          }}>
            <Plus size={18} />
            <span>Tambah Router</span>
          </button>
        </div>
      </div>
      <div className="router-grid">
        {mtLoading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
            <div>Memuat konfigurasi router...</div>
          </div>
        ) : mtConfigs.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔌</div>
            <div>Belum ada router terdaftar. Klik <b>Tambah Router</b> untuk menambahkan.</div>
          </div>
        ) : mtConfigs.map(cfg => {
          const status = routerStatus[cfg.id] || { status: 'checking' }
          return (
            <div key={cfg.id} className="router-card">
              <div className="router-card-header">
                <div>
                  {cfg.name && <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>{cfg.name}</div>}
                  <div className="router-name">{cfg.host}</div>
                  <div className="router-ip"><Activity size={14} /><span>API: {cfg.port || 8728}</span></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                  <div className={`router-status ${status.status === 'online' ? 'status-online' : status.status === 'checking' ? 'status-checking' : 'status-offline'}`}>
                    <div className="status-dot" /><span>{status.status.toUpperCase()}</span>
                  </div>
                  {status.status === 'offline' && status.error && (
                    <div title={status.error} style={{ fontSize: '0.6rem', color: '#ef4444', maxWidth: '140px', textAlign: 'right', lineHeight: 1.3, wordBreak: 'break-word' }}>
                      {status.error.length > 60 ? status.error.slice(0, 60) + '…' : status.error}
                    </div>
                  )}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
                    padding: '0.18rem 0.5rem', borderRadius: '4px',
                    background: cfg.auth_mode === 'radius' ? 'rgba(124,58,237,0.12)' : 'rgba(16,185,129,0.12)',
                    color: cfg.auth_mode === 'radius' ? '#7c3aed' : '#059669',
                    border: `1px solid ${cfg.auth_mode === 'radius' ? 'rgba(124,58,237,0.3)' : 'rgba(16,185,129,0.3)'}`,
                  }}>
                    {cfg.auth_mode === 'radius' ? '⚡ RADIUS' : cfg.auth_mode === 'local' ? '🔑 LOCAL' : '❓ UNKNOWN'}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--text-main)', flexWrap: 'wrap' }}>
                  <span>User: <b>{cfg.user}</b></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Pass: <b>{showRouterPass[cfg.id] ? cfg.pass : '••••••••'}</b>
                    <button onClick={() => setShowRouterPass(p => ({ ...p, [cfg.id]: !p[cfg.id] }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}>
                      {showRouterPass[cfg.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {cfg.auth_mode === 'radius' && (
                    <button className="btn btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={() => openScriptModal({ ...cfg, radius_secret: cfg.radius_secret })}>
                      <FileOutput size={14} /><span>Script</span>
                    </button>
                    )}
                    <button className="btn btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={() => checkRouterStatus(cfg.id)}>
                      <Activity size={14} /><span>Tes Koneksi</span>
                    </button>
                    <button className="icon-btn" title="Edit Router" onClick={() => prepareEditMt(cfg)}><Settings size={16} /></button>
                    <button className="icon-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteRouter(cfg.id)}><Trash2 size={18} /></button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
