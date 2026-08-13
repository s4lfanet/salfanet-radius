import { Bell, Search, Activity, ChevronDown } from 'lucide-react'

const TYPE_ICON = {
  payment_received: '💰', payment_confirmed: '✅', new_waiting_list: '📋',
  waiting_list_installed: '🔧', wl_assigned: '🔧', ont_removed: '🔌',
  ont_task_assigned: '🔌', new_customer_assigned: '👤', isolated: '🔴',
  due_soon: '⏰', bulk_payment_received: '💰'
}

export default function NotificationsPage({
  notifications = [],
  notifPageFilter,
  setNotifPageFilter,
  notifPageSearch,
  setNotifPageSearch,
  notifVisibleCount,
  setNotifVisibleCount,
  unreadCount,
  markAllNotifRead,
  fetchNotifications,
  handleNotifClick,
}) {
  const STEP = 20

  const filtered = notifications.filter(n => {
    if (notifPageFilter === 'unread' && n.read_at) return false
    if (notifPageSearch.trim()) {
      const q = notifPageSearch.toLowerCase()
      return (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)
    }
    return true
  })
  const visible = filtered.slice(0, notifVisibleCount)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={22} /> Riwayat Notifikasi
          </h1>
          <p className="page-description">Semua notifikasi yang pernah kamu terima.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={markAllNotifRead}>
              Tandai semua dibaca
            </button>
          )}
          <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={fetchNotifications}>
            <Activity size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[['all','Semua'],['unread','Belum Dibaca']].map(([val, label]) => (
            <button key={val}
              onClick={() => { setNotifPageFilter(val); setNotifVisibleCount(STEP) }}
              className={`btn ${notifPageFilter === val ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.82rem', padding: '0.35rem 1rem' }}>
              {label}
              {val === 'unread' && unreadCount > 0 && (
                <span style={{ marginLeft: '6px', background: '#ef4444', color: '#fff', borderRadius: '99px', fontSize: '0.65rem', padding: '1px 6px', fontWeight: '700' }}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '360px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input type="text" className="search-input"
            placeholder="Cari notifikasi..."
            value={notifPageSearch}
            onChange={e => { setNotifPageSearch(e.target.value); setNotifVisibleCount(STEP) }}
            style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: notifPageSearch ? '2.25rem' : '0.875rem' }}
          />
          {notifPageSearch && (
            <button onClick={() => { setNotifPageSearch(''); setNotifVisibleCount(STEP) }}
              style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
          )}
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bell size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />
            {notifPageSearch ? `Tidak ada hasil untuk "${notifPageSearch}"` : notifPageFilter === 'unread' ? 'Semua notifikasi sudah dibaca.' : 'Belum ada notifikasi.'}
          </div>
        ) : (
          <>
            {visible.map((n, i) => (
              <div key={n.id}
                onClick={() => handleNotifClick(n)}
                style={{
                  padding: '0.9rem 1.25rem', cursor: 'pointer', transition: 'background 0.15s',
                  background: n.read_at ? 'transparent' : 'rgba(99,102,241,0.05)',
                  borderBottom: i < visible.length - 1 ? '1px solid var(--border-color)' : 'none',
                  display: 'flex', gap: '10px', alignItems: 'flex-start'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = n.read_at ? 'transparent' : 'rgba(99,102,241,0.05)'}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                  {TYPE_ICON[n.type] || '🔔'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontWeight: n.read_at ? '500' : '700', fontSize: '0.875rem' }}>{n.title}</div>
                    {!n.read_at && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)', flexShrink: 0, marginTop: '5px' }} />}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{n.body}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {notifVisibleCount < filtered.length && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setNotifVisibleCount(c => c + STEP)}>
                  <ChevronDown size={16} /> Muat {Math.min(STEP, filtered.length - notifVisibleCount)} lagi
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({notifVisibleCount}/{filtered.length})</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
