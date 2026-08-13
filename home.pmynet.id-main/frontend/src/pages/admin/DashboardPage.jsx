import {
  Users, UserCheck, CircleDollarSign, CheckCircle, XCircle,
  Activity, AlertCircle, ChevronDown, CalendarCheck, CalendarX,
  UserX, Eye, EyeOff, Unplug
} from 'lucide-react'
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer
} from 'recharts'
import WhatsAppIcon from '../../components/WhatsAppIcon'
import TechnicianDashboardPage from '../technician/TechnicianDashboardPage'

import { useState, useEffect } from 'react'
import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

export default function DashboardPage({
  stats = {},
  users = [],
  profiles = [],
  collectorVisibleCount,
  setCollectorVisibleCount,
  invoiceFilter,
  setInvoiceFilter,
  pendingInitialPayments = [],
  confirmingPayment,
  confirmInitialPayment,
  dashWidgetExpanded,
  setDashWidgetExpanded,
  setViewingUser,
  setShowUserDetailModal,
  handleSendMessage,
  handleCancelPromise,
  openPromise,
  openCabutModal,
  activePromises = {},
  // TechnicianDashboardPage props
  ontTasks = [],
  setShowAddUserModal,
  setOntCompleteTarget,
  setOntCompleteNotes,
  setShowOntCompleteModal,
  wlAssignedCount = 0,
}) {
  const { currentUser, authHeader } = useAuthCtx()
  const { showToast, hideAmounts, toggleHideAmounts } = useUICtx()
  const { navigateTo, setActiveTab } = useNavCtx()

  const [chartData, setChartData] = useState([
    { name: 'Minggu 1', new: 0 },
    { name: 'Minggu 2', new: 0 },
    { name: 'Minggu 3', new: 0 },
    { name: 'Minggu 4', new: 0 },
  ])

  useEffect(() => {
    if (!currentUser || currentUser.role === 'technician') return
    fetch('/api/stats/weekly-growth', { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setChartData(data) })
      .catch(() => {})
  }, [currentUser?.username])

  // For technician role, delegate to TechnicianDashboardPage
  if (currentUser?.role === 'technician') {
    return (
      <TechnicianDashboardPage
        users={users}
        currentUser={currentUser}
        ontTasks={ontTasks}
        setShowAddUserModal={setShowAddUserModal}
        navigateTo={navigateTo}
        setViewingUser={setViewingUser}
        setShowUserDetailModal={setShowUserDetailModal}
        setOntCompleteTarget={setOntCompleteTarget}
        setOntCompleteNotes={setOntCompleteNotes}
        setShowOntCompleteModal={setShowOntCompleteModal}
        showToast={showToast}
        wlAssignedCount={wlAssignedCount}
      />
    )
  }


  const isCollector = currentUser?.role === 'collector'

  const collectorTotal = users.length
  const isolirUsers = users.filter(u => u.is_suspended)
  const LOAD_STEP = 10
  const visibleUsers = users.slice(0, collectorVisibleCount)
  const collectorPaid = users.filter(u => u.is_paid).length
  const collectorUnpaid = users.filter(u => !u.is_paid).length
  const paidPct = collectorTotal > 0 ? Math.round((collectorPaid / collectorTotal) * 100) : 0

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isCollector ? 'Ringkasan Penagihan' : 'Monitoring Jaringan'}
          </h1>
          <p className="page-description">
            {isCollector
              ? 'Pantau status pembayaran dan performa penagihan di wilayah Anda.'
              : 'Pantau performa infrastruktur dan pertumbuhan pelanggan Anda.'}
          </p>
        </div>
        <div className="header-actions">
          {!isCollector && (
            <button
              onClick={toggleHideAmounts}
              title={hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            >
              {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
              {hideAmounts ? 'Tampilkan' : 'Sembunyikan'}
            </button>
          )}
          <div className="last-sync">Terakhir update: {new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      <section className="stats-grid">
        {isCollector ? (
          <>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-primary"><Users size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Pelanggan Wilayah</span>
                <span className="stat-value">{collectorTotal} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>User</small></span>
              </div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setInvoiceFilter({ ...invoiceFilter, status: 'paid' }); setActiveTab('billing'); }}>
              <div className="stat-icon-wrapper stat-icon-success"><CheckCircle size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Sudah Lunas Bulan Ini</span>
                <span className="stat-value" style={{ color: '#10b981' }}>{collectorPaid} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pelanggan</small></span>
              </div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setInvoiceFilter({ ...invoiceFilter, status: 'unpaid' }); setActiveTab('billing'); }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}><XCircle size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Belum Lunas</span>
                <span className="stat-value" style={{ color: '#ef4444' }}>{collectorUnpaid} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pelanggan</small></span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-purple"><Activity size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Persentase Lunas</span>
                <span className="stat-value">{paidPct}<small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</small></span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-primary"><Users size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Total Pelanggan</span>
                <span className="stat-value">{stats.total_users} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>User</small></span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-success"><UserCheck size={24} /></div>
              <div className="stat-info">
                <span className="stat-label">Pelanggan Aktif</span>
                <span className="stat-value">{stats.online_users} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Online</small></span>
              </div>
            </div>
            {currentUser?.role !== 'technician' && (
              <>
                <div className="stat-card">
                  <div className="stat-icon-wrapper stat-icon-purple"><CircleDollarSign size={24} /></div>
                  <div className="stat-info">
                    <span className="stat-label">Estimasi Omzet</span>
                    <span className="stat-value">{hideAmounts ? '••••••' : `Rp ${(parseFloat(stats.total_revenue) || 0).toLocaleString()}`}</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>


      {isCollector ? (
        <>
        {/* Shortcut ke tab isolir jika ada */}
        {isolirUsers.length > 0 && (
          <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserX size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#ef4444' }}>
                {isolirUsers.length} pelanggan terisolir
              </span>
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '4px 12px', color: '#ef4444', borderColor: '#ef4444', flexShrink: 0 }}
              onClick={() => navigateTo('collector_isolir')}>
              Lihat →
            </button>
          </div>
        )}

        <section className="card" style={{ marginTop: '1.5rem', padding: '0', overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <h2 className="card-title" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={20} className="text-primary" />
              Daftar Pelanggan Wilayah
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '400' }}>({users.length} total)</span>
            </h2>
          </div>
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.5rem' }}>PELANGGAN</th>
                  <th>WILAYAH</th>
                  <th>STATUS</th>
                  <th>TAGIHAN BULAN INI</th>
                  <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      Belum ada data pelanggan di wilayah Anda.
                    </td>
                  </tr>
                ) : (
                  visibleUsers.map(u => (
                    <tr key={u.username}
                      onClick={() => { setViewingUser(u); setShowUserDetailModal(true); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td data-label="Pelanggan" style={{ paddingLeft: '1.5rem' }}>
                        <div style={{ fontWeight: '600' }}>{u.fullname || u.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {u.customer_id || '-'}</div>
                        {activePromises[u.username] && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '0.7rem', color: '#f59e0b', fontWeight: '600' }}>
                            <CalendarCheck size={11} /> Janji s/d {new Date(activePromises[u.username].promise_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                          </div>
                        )}
                        {u.has_ont_task ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '0.7rem', color: '#ef4444', fontWeight: '600' }} title="Ada tugas cabut ONT pending">
                            📡 Cabut ONT
                          </div>
                        ) : null}
                      </td>
                      <td data-label="Wilayah">
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{u.territory_name || 'Umum'}</span>
                      </td>
                      <td data-label="Status">
                        {u.is_online ? (
                          <span className="badge badge-online">ONLINE</span>
                        ) : (
                          u.is_suspended ? <span className="badge badge-isolir">TERISOLIR</span> : <span className="badge badge-offline">OFFLINE</span>
                        )}
                      </td>
                      <td data-label="Tagihan Bulan Ini">
                        {u.is_paid ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: '600', fontSize: '0.875rem' }}>
                            <CheckCircle size={16} /> LUNAS
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: '600', fontSize: '0.875rem' }}>
                            <XCircle size={16} /> BELUM BAYAR
                          </div>
                        )}
                      </td>
                      <td data-label="Aksi" style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button className="icon-btn" title="Detail Pelanggan" onClick={e => { e.stopPropagation(); setViewingUser(u); setShowUserDetailModal(true); }}>
                            <Eye size={16} />
                          </button>
                          <button className="icon-btn" title="WhatsApp" onClick={e => { e.stopPropagation(); handleSendMessage(u); }} style={{ color: '#25d366' }}>
                            <WhatsAppIcon size={16} color="#25d366" />
                          </button>
                          {activePromises[u.username] ? (
                            <button className="icon-btn" title="Batalkan Janji Bayar" onClick={e => { e.stopPropagation(); handleCancelPromise(u.username); }} style={{ color: '#f59e0b' }}>
                              <CalendarX size={16} />
                            </button>
                          ) : (
                            <button className="icon-btn" title="Buat Janji Bayar" onClick={e => { e.stopPropagation(); openPromise(u); }} style={{ color: '#10b981' }}>
                              <CalendarCheck size={16} />
                            </button>
                          )}
                          {!u.is_paid ? (
                            <button className="btn btn-primary btn-confirm-pay" onClick={e => {
                              e.stopPropagation();
                              setInvoiceFilter({ ...invoiceFilter, status: 'unpaid', search: u.username });
                              setActiveTab('billing');
                            }}>
                              Tagihan
                            </button>
                          ) : null}
                          {!!u.is_suspended && (
                            <button
                              className="icon-btn"
                              title="Cabut ONT/Router (hanya untuk pelanggan terisolir)"
                              onClick={e => { e.stopPropagation(); openCabutModal(u) }}
                              style={{ color: '#ef4444' }}
                            >
                              <Unplug size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Load More */}
          {collectorVisibleCount < users.length && (
            <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setCollectorVisibleCount(c => c + LOAD_STEP)}
              >
                <ChevronDown size={16} /> Muat {Math.min(LOAD_STEP, users.length - collectorVisibleCount)} lagi
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({collectorVisibleCount}/{users.length})</span>
              </button>
            </div>
          )}
        </section>
        </>

      ) : (
        <div className="dashboard-charts-grid">
          <section className="card chart-container" style={{ padding: '1.5rem', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', height: '420px' }}>
            <div className="card-header" style={{ marginBottom: '1.5rem', border: 'none', padding: 0, flexShrink: 0 }}>
              <h2 className="card-title">Tren Pertumbuhan Pelanggan</h2>
            </div>
            <div className="chart-height-wrapper" style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxShadow: 'var(--shadow-lg)' }} itemStyle={{ color: 'var(--text-main)' }} />
                  <Area type="monotone" dataKey="new" stroke="var(--primary-color)" fillOpacity={1} fill="url(#colorNew)" name="User Baru" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* RIGHT PANEL — 2 widgets dinamis */}
          {(() => {
            const thisMonth = new Date().toISOString().slice(0, 7)
            const unpaidUsers = users
              .filter(u => u.status !== 'berhenti' && !u.is_paid)
              .slice(0, 8)
            const newInstalls = users
              .filter(u => u.created_at && u.created_at.slice(0, 7) === thisMonth)
              .slice(0, 8)

            const flexUnpaid = dashWidgetExpanded === 'unpaid' ? 3 : dashWidgetExpanded === 'install' ? 1 : 1
            const flexInstall = dashWidgetExpanded === 'install' ? 3 : dashWidgetExpanded === 'unpaid' ? 1 : 1

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '420px', overflow: 'hidden' }}>

                {/* Widget 1 — Tagihan Belum Lunas */}
                <section className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: flexUnpaid, minHeight: 0, transition: 'flex 0.35s ease' }}>
                  <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}
                    onClick={() => setDashWidgetExpanded(p => p === 'unpaid' ? null : 'unpaid')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertCircle size={15} color="#ef4444" />
                      </div>
                      <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>Tagihan Belum Lunas</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                        onClick={e => { e.stopPropagation(); setInvoiceFilter({ ...invoiceFilter, status: 'unpaid' }); navigateTo('billing') }}>
                        Lihat Semua
                      </button>
                      <ChevronDown size={14} style={{ color: 'var(--text-muted)', transition: 'transform 0.3s', transform: dashWidgetExpanded === 'unpaid' ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {unpaidUsers.length === 0 ? (
                      <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <CheckCircle size={24} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.4rem' }} />
                        Semua pelanggan sudah lunas 🎉
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {unpaidUsers.map((u, idx) => {
                          const price = profiles.find(p => p.name === u.groupname)?.price || 0
                          const initial = (u.fullname || u.username || '?')[0].toUpperCase()
                          return (
                            <div key={u.username} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '0.65rem 1.25rem',
                              borderBottom: idx < unpaidUsers.length - 1 ? '1px solid var(--border-color)' : 'none',
                              transition: 'background 0.15s'
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: '700', fontSize: '0.8rem'
                              }}>{initial}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '600', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {u.fullname || u.username}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.groupname}</div>
                              </div>
                              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontWeight: '700', fontSize: '0.8rem', color: '#ef4444' }}>
                                  Rp {Number(price).toLocaleString('id-ID')}
                                </div>
                                <button style={{ fontSize: '0.68rem', color: 'var(--primary-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: '600' }}
                                  onClick={() => { setInvoiceFilter({ ...invoiceFilter, status: 'unpaid', search: u.username }); navigateTo('billing') }}>
                                  Tagih →
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        {users.filter(u => u.status !== 'berhenti' && !u.is_paid).length > 8 && (
                          <div style={{ padding: '0.6rem 1.25rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
                            +{users.filter(u => u.status !== 'berhenti' && !u.is_paid).length - 8} lainnya belum lunas
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Widget 2 — Pemasangan Baru Bulan Ini */}
                <section className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: flexInstall, minHeight: 0, transition: 'flex 0.35s ease' }}>
                  <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}
                    onClick={() => setDashWidgetExpanded(p => p === 'install' ? null : 'install')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CalendarCheck size={15} color="#10b981" />
                      </div>
                      <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>Pasang Baru Bulan Ini</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '2px 8px', borderRadius: '20px' }}>
                        {users.filter(u => u.created_at && u.created_at.slice(0, 7) === thisMonth).length} unit
                      </span>
                      <ChevronDown size={14} style={{ color: 'var(--text-muted)', transition: 'transform 0.3s', transform: dashWidgetExpanded === 'install' ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {newInstalls.length === 0 ? (
                      <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <CalendarCheck size={24} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.4rem' }} />
                        Belum ada pemasangan bulan ini
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {newInstalls.map((u, idx) => {
                          const initial = (u.fullname || u.username || '?')[0].toUpperCase()
                          const installDate = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'
                          return (
                            <div key={u.username} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '0.65rem 1.25rem',
                              borderBottom: idx < newInstalls.length - 1 ? '1px solid var(--border-color)' : 'none',
                              transition: 'background 0.15s'
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                background: 'rgba(16,185,129,0.12)', color: '#10b981',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: '700', fontSize: '0.8rem'
                              }}>{initial}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '600', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {u.fullname || u.username}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {u.territory_name || 'Tanpa wilayah'}{u.creator_name ? ` · ${u.creator_name}` : ''}
                                </div>
                              </div>
                              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#10b981' }}>{installDate}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.groupname}</div>
                              </div>
                            </div>
                          )
                        })}
                        {users.filter(u => u.created_at && u.created_at.slice(0, 7) === thisMonth).length > 8 && (
                          <div style={{ padding: '0.6rem 1.25rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
                            +{users.filter(u => u.created_at && u.created_at.slice(0, 7) === thisMonth).length - 8} pemasangan lainnya
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

              </div>
            )
          })()}

        </div>
      )}
    </div>
  )
}
