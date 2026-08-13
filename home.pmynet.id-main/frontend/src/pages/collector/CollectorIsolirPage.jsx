import { useState } from 'react'
import { UserX, Search, Unplug, ChevronDown } from 'lucide-react'
import WhatsAppIcon from '../../components/WhatsAppIcon'

import { useNavCtx } from '../../context/NavigationContext.jsx'

export default function CollectorIsolirPage({
  users = [],
  isolirSearch,
  setIsolirSearch,
  isolirVisibleCount,
  setIsolirVisibleCount,
  setViewingUser,
  setShowUserDetailModal,
  handleSendMessage,
  invoiceFilter,
  setInvoiceFilter,
  openCabutModal,
}) {
  const { navigateTo } = useNavCtx()
  const STEP = 10
  const allIsolir = users.filter(u => u.is_suspended)
  const filtered = allIsolir.filter(u => {
    if (!isolirSearch.trim()) return true
    const q = isolirSearch.toLowerCase()
    return (u.fullname || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.customer_id || '').toLowerCase().includes(q) ||
      (u.territory_name || '').toLowerCase().includes(q)
  })
  const visible = filtered.slice(0, isolirVisibleCount)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserX size={22} style={{ color: '#ef4444' }} /> Pelanggan Terisolir
          </h1>
          <p className="page-description">Pelanggan di wilayahmu yang saat ini dalam status isolir.</p>
        </div>
        <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', fontWeight: '700', padding: '4px 14px', fontSize: '0.85rem', flexShrink: 0 }}>
          {allIsolir.length} Pelanggan
        </span>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          className="search-input"
          placeholder="Cari nama, ID, wilayah..."
          value={isolirSearch}
          onChange={e => { setIsolirSearch(e.target.value); setIsolirVisibleCount(STEP) }}
          style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: isolirSearch ? '2.25rem' : '0.875rem' }}
        />
        {isolirSearch && (
          <button onClick={() => { setIsolirSearch(''); setIsolirVisibleCount(STEP) }}
            style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, fontSize: '1rem' }}>✕</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <UserX size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <div>{isolirSearch ? `Tidak ada hasil untuk "${isolirSearch}"` : 'Tidak ada pelanggan terisolir saat ini.'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {visible.map(u => (
              <div key={u.username} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setViewingUser(u); setShowUserDetailModal(true) }}>
                  <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{u.fullname || u.username}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {u.customer_id || u.username} · {u.territory_name || 'Umum'}
                  </div>
                  {!u.is_paid ? (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '99px', padding: '1px 7px', display: 'inline-block', marginTop: '4px' }}>
                      Belum Bayar
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button className="icon-btn" title="WhatsApp" onClick={() => handleSendMessage(u)} style={{ color: '#25d366' }}>
                    <WhatsAppIcon size={18} color="#25d366" />
                  </button>
                  {!u.is_paid ? (
                    <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}
                      onClick={() => { setInvoiceFilter({ ...invoiceFilter, status: 'unpaid', search: u.username }); navigateTo('billing') }}>
                      Tagihan
                    </button>
                  ) : null}
                  <button className="icon-btn" title="Cabut ONT" onClick={() => openCabutModal(u)} style={{ color: '#ef4444' }}>
                    <Unplug size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {isolirVisibleCount < filtered.length && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setIsolirVisibleCount(c => c + STEP)}>
                <ChevronDown size={16} /> Muat {Math.min(STEP, filtered.length - isolirVisibleCount)} lagi
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({isolirVisibleCount}/{filtered.length})</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
