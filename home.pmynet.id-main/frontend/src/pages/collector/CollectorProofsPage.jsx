import { Inbox, Search, Eye, ChevronDown } from 'lucide-react'

export default function CollectorProofsPage({
  paymentProofs = [],
  proofsSearch,
  setProofsSearch,
  proofsVisibleCount,
  setProofsVisibleCount,
  proofsFilter,
  setProofsFilter,
  fetchPaymentProofs,
  handleViewProofImage,
  handleVerifyProof,
}) {
  const STEP = 10
  const filtered = paymentProofs.filter(p => {
    if (!proofsSearch.trim()) return true
    const q = proofsSearch.toLowerCase()
    return (p.fullname || '').toLowerCase().includes(q) ||
      (p.username || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.bank_name || '').toLowerCase().includes(q)
  })
  const visible = filtered.slice(0, proofsVisibleCount)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Inbox size={22} /> Verifikasi Bukti Transfer
          </h1>
          <p className="page-description">Periksa dan verifikasi bukti transfer dari pelanggan.</p>
        </div>
        {proofsFilter === 'pending' && paymentProofs.length > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: '99px', fontWeight: '700', padding: '4px 14px', fontSize: '0.85rem', flexShrink: 0 }}>
            {paymentProofs.length} Pending
          </span>
        )}
      </div>

      {/* Filter status */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s}
            onClick={() => { setProofsFilter(s); setProofsSearch(''); setProofsVisibleCount(STEP); fetchPaymentProofs(s) }}
            className={`btn ${proofsFilter === s ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: '0.82rem', padding: '0.35rem 1rem' }}>
            {s === 'pending' ? '⏳ Menunggu' : s === 'approved' ? '✅ Disetujui' : '❌ Ditolak'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          className="search-input"
          placeholder="Cari nama, telepon, bank..."
          value={proofsSearch}
          onChange={e => { setProofsSearch(e.target.value); setProofsVisibleCount(STEP) }}
          style={{ width: '100%', paddingLeft: '2.25rem', paddingRight: proofsSearch ? '2.25rem' : '0.875rem' }}
        />
        {proofsSearch && (
          <button onClick={() => { setProofsSearch(''); setProofsVisibleCount(STEP) }}
            style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, fontSize: '1rem' }}>✕</button>
        )}
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Inbox size={36} style={{ opacity: 0.2, marginBottom: '0.75rem' }} /><br />
            {proofsSearch ? `Tidak ada hasil untuk "${proofsSearch}"` : proofsFilter === 'pending' ? 'Tidak ada bukti transfer yang menunggu verifikasi.' : 'Tidak ada data.'}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '1.25rem' }}>Pelanggan</th>
                    <th>Invoice</th>
                    <th>Bank</th>
                    <th>Jumlah</th>
                    <th>Tgl Kirim</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(proof => (
                    <tr key={proof.id}>
                      <td data-label="Pelanggan" style={{ paddingLeft: '1.25rem' }}>
                        <div style={{ fontWeight: '600' }}>{proof.fullname || proof.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{proof.phone}</div>
                      </td>
                      <td data-label="Invoice" style={{ fontSize: '0.82rem' }}>#{String(proof.invoice_id || '').padStart(5, '0')}</td>
                      <td data-label="Bank" style={{ fontSize: '0.82rem' }}>{proof.bank_name || '—'}</td>
                      <td data-label="Jumlah" style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                        Rp {Number(proof.amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td data-label="Tgl" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {proof.submitted_at ? new Date(proof.submitted_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—'}
                      </td>
                      <td data-label="Aksi" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleViewProofImage(proof.id)}>
                            <Eye size={13} /> Lihat
                          </button>
                          {proofsFilter === 'pending' && (
                            <>
                              <button className="btn" style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none' }}
                                onClick={() => handleVerifyProof(proof.id, 'approve')}>✓</button>
                              <button className="btn" style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none' }}
                                onClick={() => handleVerifyProof(proof.id, 'reject')}>✕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {proofsVisibleCount < filtered.length && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setProofsVisibleCount(c => c + STEP)}>
                  <ChevronDown size={16} /> Muat {Math.min(STEP, filtered.length - proofsVisibleCount)} lagi
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({proofsVisibleCount}/{filtered.length})</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
