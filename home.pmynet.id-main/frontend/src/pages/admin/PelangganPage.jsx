import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Users, UserCheck, WifiOff, Activity, UserX, CalendarCheck,
  Plus, Eye, Settings, Trash2, Sun, Inbox, FileOutput, ChevronDown,
  ChevronRight, KeyRound, Unplug, ShieldCheck, X, CheckCircle, AlertTriangle, Loader
} from 'lucide-react'
import ClearableSearch from '../../components/ClearableSearch'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

export default function PelangganPage({
  users = [],
  pelangganSubTab,
  userFilters,
  setUserFilters,
  pelangganSort,
  setPelangganSort,
  userPagination,
  setUserPagination,
  onlineUsers = [],
  offlineSessions = [],
  selectedUsers = [],
  setSelectedUsers,
  mtConfigs = [],
  profiles = [],
  territories = [],
  collectorAreas = [],
  billingSettings,
  setViewingUser,
  setShowUserDetailModal,
  setShowAddUserModal,
  setShowUserStatsModal,
  setShowImportModal,
  handleExportUsers,
  prepareEditUser,
  openSetPin,
  openOntTaskModal,
  openActionMenu,
  setOpenActionMenu,
  actionMenuOpenUp,
  setActionMenuOpenUp,
  actionMenuPos,
  setActionMenuPos,
  fetchData,
  setLoading,
}) {
  const { currentUser, authHeader } = useAuthCtx()
  const { showToast, requestConfirm } = useUICtx()
  const { navigateTo } = useNavCtx()
  // ── Internal handlers ──────────────────────────────────────────────────────
  const handleKickKoneksi = (ids) => {
    requestConfirm('Kick Koneksi', `Apakah Anda yakin ingin memutuskan koneksi ${ids.length} user terpilih?`, async () => {
      setLoading(true)
      try {
        let success = 0, failed = 0
        for (const username of ids) {
          const res = await fetch(`/api/sessions/terminate/${username}`, { method: 'POST', headers: authHeader() })
          if (res.ok) success++; else failed++
        }
        if (success > 0) showToast(`Berhasil kick ${success} user${failed > 0 ? `, ${failed} gagal` : ''}`, 'success')
        else showToast('Gagal kick koneksi user terpilih', 'error')
        fetchData(true); setSelectedUsers([])
      } catch (err) { showToast('Gagal kick koneksi: ' + err.message, 'error') }
      finally { setLoading(false) }
    }, 'warning')
  }

  const handleSyncSessions = () => {
    requestConfirm('Sinkronisasi Sesi', 'Bersihkan sesi stale? Ini akan menutup sesi yang menggantung di database.', async () => {
      setLoading(true)
      try {
        await fetch('/api/sessions/sync', { method: 'POST', headers: authHeader() })
        showToast('Sinkronisasi sesi selesai', 'success')
        fetchData(true)
      } catch (err) { showToast('Gagal sinkronisasi: ' + err.message, 'error') }
      finally { setLoading(false) }
    }, 'info')
  }

  // ── PPP Sync Check ─────────────────────────────────────────────────────────
  const [showPppSyncModal, setShowPppSyncModal] = useState(false)
  const [pppSyncLoading, setPppSyncLoading] = useState(false)
  const [pppSyncResult, setPppSyncResult] = useState(null)
  const [pppFixLoading, setPppFixLoading] = useState({}) // { username: true/false }

  const handlePppSyncCheck = async () => {
    setShowPppSyncModal(true)
    setPppSyncResult(null)
    setPppSyncLoading(true)
    try {
      const res = await fetch('/api/admin/ppp-sync-check', { headers: authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal cek sinkronisasi')
      setPppSyncResult(data)
    } catch (err) { showToast('Gagal cek sinkronisasi: ' + err.message, 'error'); setShowPppSyncModal(false) }
    finally { setPppSyncLoading(false) }
  }

  const handlePppFix = async (usernames) => {
    if (!usernames || usernames.length === 0) return
    const loadingMap = {}
    usernames.forEach(u => { loadingMap[u] = true })
    setPppFixLoading(loadingMap)
    try {
      const res = await fetch('/api/admin/ppp-sync-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ usernames })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal fix')
      showToast(`Selesai: ${data.success} berhasil dibuat${data.failed > 0 ? `, ${data.failed} gagal` : ''}`, data.failed > 0 ? 'warning' : 'success')
      await handlePppSyncCheck()
    } catch (err) { showToast('Gagal: ' + err.message, 'error') }
    finally { setPppFixLoading({}) }
  }

  const handleDeleteSessions = (ids) => {
    requestConfirm('Hapus Sesi', `Hapus ${ids.length} record sesi terpilih?`, async () => {
      setLoading(true)
      try {
        await fetch('/api/sessions/delete', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionIds: ids })
        })
        showToast('Sesi berhasil dihapus', 'success')
        fetchData(true); setSelectedUsers([])
      } catch (err) { showToast('Gagal menghapus sesi: ' + err.message, 'error') }
      finally { setLoading(false) }
    }, 'danger')
  }

  const handleIsolirOnlineUsers = (usernames) => {
    if (!usernames.length) return
    requestConfirm('Isolir User Online', 'Isolir ' + usernames.length + ' user online terpilih sekarang?', async () => {
      setLoading(true)
      try {
        let success = 0, failed = 0
        for (const username of usernames) {
          const res = await fetch('/api/users/' + username + '/suspend', { method: 'POST', headers: authHeader() })
          if (res.ok) success++; else failed++
        }
        if (success > 0) showToast('Berhasil isolir ' + success + ' user' + (failed ? ', ' + failed + ' gagal' : ''), 'success')
        else showToast('Gagal isolir user online terpilih', 'error')
        fetchData(true); setSelectedUsers([])
      } catch (err) { showToast('Gagal isolir user: ' + err.message, 'error') }
      finally { setLoading(false) }
    }, 'warning')
  }

  // ── Sort helpers ────────────────────────────────────────────────────────────
  const SortIconP = ({ col }) => {
    if (pelangganSort.col !== col) return <span style={{ opacity: 0.25, fontSize: '0.7rem', marginLeft: 4 }}>↕</span>
    return <span style={{ fontSize: '0.7rem', marginLeft: 4, color: 'var(--primary-color)' }}>{pelangganSort.dir === 'asc' ? '↑' : '↓'}</span>
  }
  const handleSortP = (col) => {
    setPelangganSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
    setUserPagination(p => ({ ...p, currentPage: 1 }))
  }
  const thSortStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  // ── Session view (online/offline tab) ──────────────────────────────────────
  const renderSessionView = (isOnlineView) => {
    const data = isOnlineView ? onlineUsers : offlineSessions
    const filteredData = data.filter(s => {
      const matchSearch = (s.username || '').toLowerCase().includes(userFilters.search.toLowerCase())
      const matchNas = userFilters.nas === 'all' || s.router_ip === mtConfigs.find(c => c.id.toString() === userFilters.nas)?.host
      return matchSearch && matchNas
    })

    return (
      <div className="animate-fade-in">
        <div className="actions-row">
          {currentUser?.role === 'admin' && (
            <>
              <button className="btn btn-gold" onClick={handleSyncSessions}><Activity size={16} /> Bersihkan Data</button>
              <button className="btn btn-orange" onClick={() => handleKickKoneksi(selectedUsers)} disabled={!selectedUsers.length}><Sun size={16} /> Kick Koneksi</button>
              {isOnlineView && (
                <button className="btn btn-soft-red" onClick={() => handleIsolirOnlineUsers(selectedUsers)} disabled={!selectedUsers.length}>
                  <UserX size={16} /> Isolir
                </button>
              )}
              <button className="btn btn-soft-red" onClick={() => handleDeleteSessions(selectedUsers)} disabled={!selectedUsers.length}><Trash2 size={16} /> Hapus Session</button>
            </>
          )}
        </div>

        <div className="filters-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Filter By:</span>
          <select className="search-input" style={{ width: '150px' }} value={userFilters.nas} onChange={e => setUserFilters({ ...userFilters, nas: e.target.value })}>
            <option value="all">NAS</option>
            {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
          </select>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select className="search-input" style={{ width: '70px', padding: '4px 8px' }} value={userPagination.entriesPerPage} onChange={e => setUserPagination({ ...userPagination, entriesPerPage: Number(e.target.value), currentPage: 1 })}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>entries per page</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem' }}>Search:</span>
              <ClearableSearch value={userFilters.search} onChange={e => setUserFilters({ ...userFilters, search: e.target.value })} placeholder="Cari nama..." style={{ width: '200px' }} />
            </div>
          </div>

          <div className="table-responsive">
            <table className="modern-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input type="checkbox"
                      checked={selectedUsers.length === filteredData.length && filteredData.length > 0}
                      onChange={() => setSelectedUsers(selectedUsers.length === filteredData.length ? [] : filteredData.map(s => isOnlineView ? s.username : s.acctsessionid))} />
                  </th>
                  <th>SESSION</th>
                  <th>USERNAME</th>
                  <th>NAS</th>
                  <th>IP ADDRESS</th>
                  <th>MAC</th>
                  <th>UPTIME</th>
                  <th>LAST LOGIN</th>
                  {!isOnlineView && <th>LAST LOGOUT</th>}
                </tr>
              </thead>
              <tbody>
                {filteredData.length > 0 ? (
                  filteredData.slice((userPagination.currentPage - 1) * userPagination.entriesPerPage, userPagination.currentPage * userPagination.entriesPerPage).map(s => (
                    <tr key={s.acctsessionid}>
                      <td><input type="checkbox"
                        checked={selectedUsers.includes(isOnlineView ? s.username : s.acctsessionid)}
                        onChange={() => setSelectedUsers(prev => {
                          const id = isOnlineView ? s.username : s.acctsessionid
                          return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                        })} /></td>
                      <td data-label="Session ID" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.acctsessionid.substring(0, 8)}...</td>
                      <td data-label="Username" style={{ fontWeight: '600' }}>{s.username}</td>
                      <td data-label="Router IP">{s.router_ip}</td>
                      <td data-label="IP Address" style={{ color: 'var(--primary-color)', fontWeight: '500' }}>{s.ip_address}</td>
                      <td data-label="MAC Address" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.mac_address || '-'}</td>
                      <td data-label="Uptime">{Math.floor(s.duration / 3600)}h {Math.floor((s.duration % 3600) / 60)}m</td>
                      <td data-label="Login Time" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(s.login_time).toLocaleString('id-ID')}</td>
                      {!isOnlineView && <td data-label="Logout Time" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.logout_time ? new Date(s.logout_time).toLocaleString('id-ID') : '-'}</td>}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isOnlineView ? 8 : 9} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                      Belum ada data session {isOnlineView ? 'online' : 'offline'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  if (pelangganSubTab === 'online') return renderSessionView(true)
  if (pelangganSubTab === 'offline') return renderSessionView(false)

  // ── Filter users ───────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    if (pelangganSubTab === 'online' && (!u.is_online || u.is_suspended)) return false
    if (pelangganSubTab === 'offline' && (u.is_online || u.is_suspended)) return false

    // Filter connection type
    if (userFilters.connectionType === 'pppoe' && u.connection_type !== 'pppoe' && u.connection_type != null) return false
    if (userFilters.connectionType === 'static' && u.connection_type !== 'static' && u.connection_type !== 'hotspot') return false

    const matchSearch =
      (u.username || '').toLowerCase().includes(userFilters.search.toLowerCase()) ||
      (u.fullname && u.fullname.toLowerCase().includes(userFilters.search.toLowerCase()))
    if (!matchSearch) return false

    const matchStatus = userFilters.status === 'all' ||
      (userFilters.status === 'online' && u.is_online && !u.is_suspended && u.status !== 'berhenti') ||
      (userFilters.status === 'active' && !u.is_online && !u.is_suspended && u.status !== 'berhenti') ||
      (userFilters.status === 'isolir' && u.is_suspended && u.status !== 'berhenti') ||
      (userFilters.status === 'berhenti' && u.status === 'berhenti')
    if (!matchStatus) return false

    if (userFilters.profile !== 'all' && u.groupname !== userFilters.profile) return false
    if (userFilters.nas !== 'all' && u.nas_id?.toString() !== userFilters.nas) return false

    if (userFilters.wilayah === 'tanpa') {
      if (u.territory_area_id) return false
    } else if (userFilters.wilayah !== 'all') {
      if (String(u.territory_area_id) !== userFilters.wilayah) return false
    }

    return true
  })

  if (pelangganSort.col) {
    filteredUsers.sort((a, b) => {
      let va, vb
      if (pelangganSort.col === 'id') { va = (a.customer_id || '').toLowerCase(); vb = (b.customer_id || '').toLowerCase() }
      else if (pelangganSort.col === 'nama') { va = (a.fullname || '').toLowerCase(); vb = (b.fullname || '').toLowerCase() }
      else if (pelangganSort.col === 'pppoe') { va = (a.username || '').toLowerCase(); vb = (b.username || '').toLowerCase() }
      else if (pelangganSort.col === 'profile') { va = (a.groupname || '').toLowerCase(); vb = (b.groupname || '').toLowerCase() }
      else if (pelangganSort.col === 'wilayah') { va = (a.territory_dusun || a.territory_name || '').toLowerCase(); vb = (b.territory_dusun || b.territory_name || '').toLowerCase() }
      else if (pelangganSort.col === 'nas') { va = (mtConfigs.find(c => c.id === a.nas_id)?.name || '').toLowerCase(); vb = (mtConfigs.find(c => c.id === b.nas_id)?.name || '').toLowerCase() }
      else if (pelangganSort.col === 'odp') { va = (a.odp || '').toLowerCase(); vb = (b.odp || '').toLowerCase() }
      else if (pelangganSort.col === 'jatuh_tempo') { va = a.due_date_day || 0; vb = b.due_date_day || 0 }
      else if (pelangganSort.col === 'status') {
        const rank = u => u.status === 'berhenti' ? 3 : u.is_suspended ? 2 : u.is_online ? 0 : 1
        va = rank(a); vb = rank(b)
      }
      else if (pelangganSort.col === 'registrasi') { va = a.created_at || ''; vb = b.created_at || '' }
      if (va < vb) return pelangganSort.dir === 'asc' ? -1 : 1
      if (va > vb) return pelangganSort.dir === 'asc' ? 1 : -1
      return 0
    })
  }

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / userPagination.entriesPerPage))
  const safePage = Math.min(userPagination.currentPage, totalPages)

  return (
    <div className="animate-fade-in">
      <div className="breadcrumb" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{billingSettings?.company_name || 'Billing'}</span> <ChevronRight size={14} />
        <span style={{ fontWeight: '600' }}>
          {userFilters.connectionType === 'pppoe' ? 'PPPoE Users' : userFilters.connectionType === 'static' ? 'Static IP Users' : 'Daftar Pelanggan'}
        </span>
      </div>

      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ fontSize: '1.25rem' }}>
          {userFilters.connectionType === 'pppoe' ? 'PPPoE Users' : userFilters.connectionType === 'static' ? 'Static IP Users' : 'Daftar Pelanggan'}
        </h1>
        {currentUser?.role === 'admin' && (
          <button className="btn btn-gold" onClick={handlePppSyncCheck} style={{ fontSize: '0.8rem' }}>
            <ShieldCheck size={15} /> Cek Sinkronisasi PPPoE
          </button>
        )}
      </div>

      {/* Tab Tipe Koneksi */}
      {(() => {
        const countAll = users.filter(u => u.status !== 'berhenti').length
        const countPppoe = users.filter(u => (u.connection_type === 'pppoe' || !u.connection_type) && u.status !== 'berhenti').length
        const countStatic = users.filter(u => (u.connection_type === 'static' || u.connection_type === 'hotspot') && u.status !== 'berhenti').length
        const tabs = [
          { key: 'all', label: 'Semua', count: countAll },
          { key: 'pppoe', label: 'PPPoE', count: countPppoe },
          { key: 'static', label: 'Static IP', count: countStatic },
        ]
        return (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setUserFilters(f => ({ ...f, connectionType: tab.key, status: 'all' }))}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  border: `2px solid ${userFilters.connectionType === tab.key ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  background: userFilters.connectionType === tab.key ? 'var(--primary-color)' : 'transparent',
                  color: userFilters.connectionType === tab.key ? '#fff' : 'var(--text-secondary)',
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
                <span style={{
                  background: userFilters.connectionType === tab.key ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                  color: userFilters.connectionType === tab.key ? '#fff' : 'var(--text-muted)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        )
      })()}

      {/* Stats cards */}
      {(() => {
        const thisMonth = new Date().toISOString().slice(0, 7)
        // Filter base sesuai tab koneksi yang aktif
        const baseUsers = userFilters.connectionType === 'all' ? users
          : userFilters.connectionType === 'pppoe' ? users.filter(u => u.connection_type === 'pppoe' || !u.connection_type)
          : userFilters.connectionType === 'static' ? users.filter(u => u.connection_type === 'static' || u.connection_type === 'hotspot')
          : users.filter(u => u.connection_type === userFilters.connectionType)
        const psbThisMonth = baseUsers.filter(u => u.created_at && u.created_at.slice(0, 7) === thisMonth && u.status !== 'berhenti').length
        const cards = [
          { label: 'TOTAL USER', value: baseUsers.filter(u => u.status !== 'berhenti').length, filter: 'all', icon: <Users size={18} />, color: 'stat-icon-blue' },
          { label: 'ONLINE', value: baseUsers.filter(u => u.is_online && !u.is_suspended && u.status !== 'berhenti').length, filter: 'online', icon: <UserCheck size={18} />, color: 'stat-icon-green' },
          { label: 'OFFLINE', value: baseUsers.filter(u => !u.is_online && !u.is_suspended && u.status !== 'berhenti').length, filter: 'active', icon: <WifiOff size={18} />, color: 'stat-icon-blue' },
          { label: 'ISOLIR', value: baseUsers.filter(u => u.is_suspended && u.status !== 'berhenti').length, filter: 'isolir', icon: <Activity size={18} />, color: 'stat-icon-yellow' },
          { label: 'BERHENTI', value: baseUsers.filter(u => u.status === 'berhenti').length, filter: 'berhenti', icon: <UserX size={18} />, color: 'stat-icon-pink' },
          { label: 'PSB BULAN INI', value: psbThisMonth, filter: 'psb_this_month', icon: <CalendarCheck size={18} />, color: 'stat-icon-green', noFilter: true },
        ]
        return (
          <section className="pppoe-stats-grid">
            {cards.map(({ label, value, filter, icon, color, noFilter }) => {
              const isActive = !noFilter && userFilters.status === filter
              return (
                <div key={filter} className="stat-card"
                  onClick={() => !noFilter && setUserFilters(f => ({ ...f, status: isActive ? 'all' : filter }))}
                  style={{ cursor: noFilter ? 'default' : 'pointer', padding: '1rem 1.25rem', border: `2px solid ${isActive ? 'var(--primary-color)' : 'transparent'}`, boxShadow: isActive ? '0 0 0 3px rgba(59,130,246,0.15)' : undefined }}>
                  <div className={`stat-icon-wrapper ${color}`} style={{ width: '36px', height: '36px' }}>{icon}</div>
                  <div className="stat-info">
                    <span className="stat-label" style={{ fontSize: '0.62rem' }}>{label}</span>
                    <span className="stat-value" style={{ fontSize: '1.4rem' }}>{value}</span>
                  </div>
                  {isActive && <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '0.6rem', fontWeight: '700', color: 'var(--primary-color)' }}>✓</span>}
                </div>
              )
            })}
          </section>
        )
      })()}

      <section className="card" style={{ padding: '1.5rem' }}>
        <div className="actions-row">
          {!['technician', 'noc'].includes(currentUser?.role) && (
            <button className="btn btn-blue" onClick={() => setShowAddUserModal(true)}><Plus size={16} /> Tambah User</button>
          )}
          {currentUser?.role === 'admin' && (
            <>
              <button className="btn btn-teal" onClick={() => setShowUserStatsModal(true)}><Activity size={16} /> Grafik User</button>
              <button className="btn btn-orange" onClick={() => setShowImportModal(true)}><Inbox size={16} /> Import</button>
              <button className="btn btn-darkblue" onClick={handleExportUsers}><FileOutput size={16} /> Export</button>
            </>
          )}
        </div>

        {currentUser?.role !== 'technician' && (
          <div className="filters-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Filter By:</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="search-input" style={{ width: '130px', paddingLeft: '0.75rem' }} value={userFilters.profile} onChange={e => setUserFilters({ ...userFilters, profile: e.target.value })}>
                  <option value="all">Profile</option>
                  {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <select className="search-input" style={{ width: '130px', paddingLeft: '0.75rem' }} value={userFilters.nas} onChange={e => setUserFilters({ ...userFilters, nas: e.target.value })}>
                  <option value="all">NAS</option>
                  {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
                </select>
                <select className="search-input" style={{ width: '130px', paddingLeft: '0.75rem' }} value={userFilters.pop} onChange={e => setUserFilters({ ...userFilters, pop: e.target.value })}>
                  <option value="all">POP</option>
                </select>
                <select className="search-input" style={{ width: '130px', paddingLeft: '0.75rem' }} value={userFilters.odp} onChange={e => setUserFilters({ ...userFilters, odp: e.target.value })}>
                  <option value="all">ODP</option>
                </select>
                <select className="search-input" style={{ width: '180px', paddingLeft: '0.75rem' }}
                  value={userFilters.wilayah}
                  onChange={e => { setUserFilters({ ...userFilters, wilayah: e.target.value }); setUserPagination(p => ({ ...p, currentPage: 1 })) }}>
                  <option value="all">Semua Dusun</option>
                  <option value="tanpa">⚠ Tanpa Dusun</option>
                  {currentUser?.role === 'collector'
                    ? collectorAreas
                        .filter(a => String(a.collector_id) === String(currentUser.id))
                        .map(a => (
                          <option key={a.id} value={String(a.id)}>
                            {a.dusun_nama || a.kelurahan_nama}
                          </option>
                        ))
                    : (() => {
                        // Group by kolektor (bukan territory) agar lebih intuitif
                        const byCollector = {}
                        collectorAreas.forEach(a => {
                          const key = a.collector_name || 'Tanpa Kolektor'
                          if (!byCollector[key]) byCollector[key] = []
                          byCollector[key].push(a)
                        })
                        return Object.entries(byCollector).map(([collectorName, areas]) => (
                          <optgroup key={collectorName} label={collectorName}>
                            {areas.map(a => (
                              <option key={a.id} value={String(a.id)}>
                                {a.dusun_nama || a.kelurahan_nama}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      })()
                  }
                </select>
                <select className="search-input" style={{ width: '130px', paddingLeft: '0.75rem' }} value={userFilters.status} onChange={e => setUserFilters({ ...userFilters, status: e.target.value })}>
                  <option value="all">Status</option>
                  <option value="online">Online</option>
                  <option value="isolir">Isolir</option>
                  <option value="berhenti">Berhenti</option>
                </select>
                <select className="search-input" style={{ width: '150px', paddingLeft: '0.75rem' }} value={userFilters.status} onChange={e => setUserFilters({ ...userFilters, status: e.target.value })}>
                  <option value="all">Siklus Tagihan</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select className="search-input" style={{ width: '70px', padding: '4px 8px' }} value={userPagination.entriesPerPage} onChange={e => setUserPagination({ ...userPagination, entriesPerPage: Number(e.target.value), currentPage: 1 })}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>entries per page</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem' }}>Search:</span>
            <ClearableSearch value={userFilters.search} onChange={e => setUserFilters({ ...userFilters, search: e.target.value })} placeholder="Cari nama..." style={{ width: '160px' }} />
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '3px' }}>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage === 1} onClick={() => setUserPagination({ ...userPagination, currentPage: 1 })}>«</button>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage === 1} onClick={() => setUserPagination({ ...userPagination, currentPage: safePage - 1 })}>‹</button>
                <button className="btn btn-primary" style={{ padding: '4px 8px', minWidth: '32px' }}>{safePage}</button>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage >= totalPages} onClick={() => setUserPagination({ ...userPagination, currentPage: safePage + 1 })}>›</button>
                <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage >= totalPages} onClick={() => setUserPagination({ ...userPagination, currentPage: totalPages })}>»</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th style={thSortStyle} onClick={() => handleSortP('id')}>ID <SortIconP col="id" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('status')}>STATUS <SortIconP col="status" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('nama')}>NAMA <SortIconP col="nama" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('pppoe')}>{userFilters.connectionType === 'static' ? 'IP STATIC' : 'PPPoE'} <SortIconP col="pppoe" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('profile')}>PROFILE <SortIconP col="profile" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('wilayah')}>WILAYAH <SortIconP col="wilayah" /></th>
                <th style={{ textAlign: 'center' }}>LOKASI</th>
                <th style={thSortStyle} onClick={() => handleSortP('nas')}>NAS <SortIconP col="nas" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('odp')}>ODP <SortIconP col="odp" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('jatuh_tempo')}>JATUH TEMPO <SortIconP col="jatuh_tempo" /></th>
                <th style={thSortStyle} onClick={() => handleSortP('registrasi')}>REGISTRASI <SortIconP col="registrasi" /></th>
                <th style={{ textAlign: 'right' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.slice((safePage - 1) * userPagination.entriesPerPage, safePage * userPagination.entriesPerPage).map(u => (
                <tr key={u.username}
                  onClick={() => { setViewingUser(u); setShowUserDetailModal(true) }}
                  style={{ cursor: 'pointer' }}>
                  <td data-label="Customer ID"><span style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-color)' }}>{u.customer_id || '-'}</span></td>
                  <td data-label="Status">
                    {u.status === 'berhenti'
                      ? <span className="badge badge-stopped">BERHENTI</span>
                      : u.is_suspended
                        ? <span className="badge badge-isolir">ISOLIR</span>
                        : u.is_online
                          ? <span className="badge badge-online">ONLINE</span>
                          : <span className="badge badge-offline">OFFLINE</span>
                    }
                    {u.install_date && u.install_date.slice(0, 7) === new Date().toISOString().slice(0, 7) && (
                      <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.62rem', marginTop: '3px', display: 'block' }}>✦ BARU</span>
                    )}
                    {!!u.has_ont_task && (
                      <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.62rem', marginTop: '3px', display: 'block' }} title="Ada tugas cabut ONT pending">📡 CABUT ONT</span>
                    )}
                  </td>
                  <td data-label="Full Name">{u.fullname || '-'}</td>
                  <td data-label="Username" style={{ fontWeight: '600' }}>
                    {userFilters.connectionType === 'static' && u.static_ip ? u.static_ip : u.username}
                  </td>
                  <td data-label="Group/Profile"><span className="badge badge-purple">{u.groupname || '-'}</span></td>
                  <td data-label="Wilayah" style={{ fontSize: '0.82rem' }}>
                    {u.territory_dusun
                      ? <span title={u.territory_name || ''}>{u.territory_dusun}</span>
                      : u.territory_id
                        ? <span style={{ color: '#f59e0b', fontSize: '0.75rem' }} title="Dusun belum dipilih">⚠ Perlu diupdate</span>
                        : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td data-label="Lokasi" style={{ textAlign: 'center' }}>
                    {u.latitude && u.longitude ? (
                      <a href={`https://www.google.com/maps?q=${u.latitude},${u.longitude}`} target="_blank" rel="noopener noreferrer"
                        title={`Buka di Google Maps: ${u.latitude}, ${u.longitude}`}
                        style={{ fontSize: '1.1rem', textDecoration: 'none', lineHeight: 1 }}
                        onClick={e => e.stopPropagation()}>📍</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</span>
                    )}
                  </td>
                  <td data-label="Router NAS">{(() => {
                    const nas = mtConfigs.find(c => c.id === u.nas_id)
                    if (!nas) return '-'
                    const isRadius = nas.auth_mode === 'radius'
                    return (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span>{nas.name || nas.host}</span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
                          background: isRadius ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)',
                          color: isRadius ? '#7c3aed' : '#059669' }}>
                          {isRadius ? 'RADIUS' : 'LOCAL'}
                        </span>
                      </span>
                    )
                  })()}</td>
                  <td data-label="ODP">{u.odp || '-'}</td>
                  <td data-label="Jatuh Tempo">Tgl {u.due_date_day}</td>
                  <td>
                    <div style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                      <div style={{ color: 'var(--text-muted)' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '-'}</div>
                      {u.creator_name && <div style={{ color: 'var(--primary-color)', fontWeight: '600' }}>Oleh: {u.creator_name}</div>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      {currentUser?.role === 'admin' ? (
                        <>
                          <button className="icon-btn" title="Detail Pelanggan" onClick={e => { e.stopPropagation(); setViewingUser(u); setShowUserDetailModal(true) }}>
                            <Eye size={16} />
                          </button>
                          <button className="icon-btn" title="Edit Parameter" onClick={e => { e.stopPropagation(); prepareEditUser(u) }}>
                            <Settings size={16} />
                          </button>
                          <button className="icon-btn" title="Aksi lainnya"
                            onClick={e => {
                              e.stopPropagation()
                              if (openActionMenu === u.username) { setOpenActionMenu(null); return }
                              const rect = e.currentTarget.getBoundingClientRect()
                              const spaceBelow = window.innerHeight - rect.bottom
                              const openUp = spaceBelow < 240
                              setActionMenuOpenUp(openUp)
                              setActionMenuPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right })
                              setOpenActionMenu(u.username)
                            }}>
                            <ChevronDown size={16} />
                          </button>
                        </>
                      ) : currentUser?.role === 'noc' ? (
                        <>
                          <button className="icon-btn" title="Detail Pelanggan" onClick={e => { e.stopPropagation(); setViewingUser(u); setShowUserDetailModal(true) }}>
                            <Eye size={16} />
                          </button>
                          <button className="icon-btn" title="Set PIN Portal" onClick={e => { e.stopPropagation(); openSetPin(u) }}>
                            <KeyRound size={16} style={{ color: '#8b5cf6' }} />
                          </button>
                          {!!u.is_suspended && u.status !== 'berhenti' && (
                            <button className="icon-btn" title="Buat Task Cabut ONT" onClick={e => { e.stopPropagation(); openOntTaskModal(u) }}>
                              <Unplug size={16} style={{ color: '#ef4444' }} />
                            </button>
                          )}
                        </>
                      ) : (
                        <button className="icon-btn" title="Detail Pelanggan" onClick={e => { e.stopPropagation(); setViewingUser(u); setShowUserDetailModal(true) }}>
                          <Eye size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan="14" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>No data available in table</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing {Math.min((safePage - 1) * userPagination.entriesPerPage + 1, filteredUsers.length)} to {Math.min(safePage * userPagination.entriesPerPage, filteredUsers.length)} of {filteredUsers.length} entries
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage === 1} onClick={() => setUserPagination({ ...userPagination, currentPage: 1 })}>«</button>
            <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage === 1} onClick={() => setUserPagination({ ...userPagination, currentPage: safePage - 1 })}>‹</button>
            <button className="btn btn-primary" style={{ padding: '4px 8px' }}>{safePage}</button>
            <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage >= totalPages} onClick={() => setUserPagination({ ...userPagination, currentPage: safePage + 1 })}>›</button>
            <button className="btn btn-outline" style={{ padding: '4px 8px' }} disabled={safePage >= totalPages} onClick={() => setUserPagination({ ...userPagination, currentPage: totalPages })}>»</button>
          </div>
        </div>
      </section>

      {/* ── PPP Sync Modal ─────────────────────────────────────────────── */}
      {showPppSyncModal && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPppSyncModal(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 className="modal-title"><ShieldCheck size={18} /> Sinkronisasi PPPoE</h2>
              <button className="modal-close" onClick={() => setShowPppSyncModal(false)}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {pppSyncLoading && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
                  <div>Mengambil data dari MikroTik, mohon tunggu...</div>
                </div>
              )}

              {!pppSyncLoading && pppSyncResult && !Array.isArray(pppSyncResult.missing) && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <div style={{ marginBottom: '0.75rem' }}>Data perlu diperbarui.</div>
                  <button className="btn btn-primary" onClick={handlePppSyncCheck}>Muat Ulang</button>
                </div>
              )}
              {!pppSyncLoading && pppSyncResult && Array.isArray(pppSyncResult.missing) && (() => {
                const { missing, total_db, nas_checked = [], no_nas_count = 0 } = pppSyncResult
                const anyFixLoading = Object.values(pppFixLoading).some(Boolean)

                return (
                  <>
                    {/* Info router */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: no_nas_count > 0 ? '0.5rem' : '1.25rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      Router dicek: {nas_checked.map(n => (
                        <span key={n.nas_id} style={{ marginRight: '12px' }}>
                          <strong>{n.nas_name}</strong>{' '}
                          {n.error ? <span style={{ color: '#ef4444' }}>⚠ {n.error}</span> : `(${n.db_count} di DB)`}
                        </span>
                      ))}
                    </div>
                    {no_nas_count > 0 && (
                      <div style={{ fontSize: '0.75rem', marginBottom: '1.25rem', padding: '0.5rem 0.75rem', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', color: '#92400e' }}>
                        ⚠ <strong>{no_nas_count} pelanggan PPPoE</strong> tidak dicek karena belum di-assign ke router LOCAL manapun.
                        Buka detail pelanggan → Edit Data → set kolom <strong>NAS/Router</strong> terlebih dahulu.
                      </div>
                    )}

                    {missing.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2.5rem', color: '#10b981' }}>
                        <CheckCircle size={40} style={{ marginBottom: '0.75rem' }} />
                        <div style={{ fontWeight: '600', fontSize: '1rem' }}>Semua pelanggan sudah ada di MikroTik</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{total_db} pelanggan PPPoE — tidak ada yang kurang</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: '600' }}>
                            <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            {missing.length} pelanggan belum ada PPP Secret-nya di MikroTik
                          </div>
                          <button className="btn btn-primary" style={{ fontSize: '0.75rem' }}
                            onClick={() => handlePppFix(missing.map(m => m.username))}
                            disabled={anyFixLoading}>
                            {anyFixLoading ? '⏳ Membuat...' : `Buat Semua (${missing.length})`}
                          </button>
                        </div>

                        <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                          <thead><tr>
                            <th>Username</th>
                            <th>Router</th>
                            <th>Paket</th>
                            <th title="Status yang akan dibuat: Aktif = secret di-enable, Isolir = secret di-disable">Secret Dibuat</th>
                            <th style={{ width: '70px' }}>Aksi</th>
                          </tr></thead>
                          <tbody>
                            {missing.map((m, idx) => (
                              <tr key={idx}>
                                <td><code style={{ fontSize: '0.78rem', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px' }}>{m.username}</code></td>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{m.nas_name}</td>
                                <td style={{ color: 'var(--text-muted)' }}>{m.groupname || '-'}</td>
                                <td>
                                  <span className={`badge ${m.is_isolated ? 'badge-isolir' : 'badge-online'}`}>
                                    {m.is_isolated ? 'Disabled' : 'Enabled'}
                                  </span>
                                </td>
                                <td>
                                  <button className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '2px 10px' }}
                                    onClick={() => handlePppFix([m.username])}
                                    disabled={anyFixLoading || pppFixLoading[m.username]}>
                                    {pppFixLoading[m.username] ? '⏳' : 'Buat'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPppSyncModal(false)}>Tutup</button>
              {pppSyncResult && !pppSyncLoading && (
                <button className="btn btn-outline" onClick={handlePppSyncCheck} disabled={pppSyncLoading}>
                  <ShieldCheck size={14} /> Cek Ulang
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
