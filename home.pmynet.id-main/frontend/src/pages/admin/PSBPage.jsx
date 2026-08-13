import { useState, useEffect } from 'react'
import { ChevronLeft, ClipboardList, CheckCircle, MapPin, Package } from 'lucide-react'
import MapPicker from '../../components/MapPicker'
import SearchableSelect from '../../components/SearchableSelect'
import { composeAddress } from '../../utils/appUtils'

import { useAuthCtx } from '../../context/AuthContext.jsx'
import { useUICtx } from '../../context/UIContext.jsx'
import { useNavCtx } from '../../context/NavigationContext.jsx'

function PsbAddonSelector({ addons, setAddons, authHeader }) {
  const [addonTypes, setAddonTypes] = useState([])

  useEffect(() => {
    fetch('/api/addon-types', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAddonTypes(data.filter(a => a.is_active)))
      .catch(() => {})
  }, [authHeader])

  if (addonTypes.length === 0) return null

  const toggle = (typeId) => {
    setAddons(prev => {
      if (prev.find(a => a.addon_type_id === typeId)) return prev.filter(a => a.addon_type_id !== typeId)
      return [...prev, { addon_type_id: typeId, price_override: null }]
    })
  }

  const setOverride = (typeId, val) => {
    setAddons(prev => prev.map(a => a.addon_type_id === typeId ? { ...a, price_override: val === '' ? null : parseFloat(val) } : a))
  }

  const addonTotal = addons.reduce((sum, a) => {
    const t = addonTypes.find(x => x.id === a.addon_type_id)
    return sum + (a.price_override ?? t?.price ?? 0)
  }, 0)

  return (
    <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Package size={13} /> Layanan Tambahan <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opsional)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {addonTypes.map(t => {
          const checked = !!addons.find(a => a.addon_type_id === t.id)
          const entry = addons.find(a => a.addon_type_id === t.id)
          return (
            <div key={t.id}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '0.6rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(99,102,241,0.07)' : 'transparent', border: `1px solid ${checked ? 'rgba(99,102,241,0.3)' : 'transparent'}`, transition: 'all 0.15s' }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: checked ? 600 : 400 }}>{t.name}</span>
                  {t.description && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '6px' }}>— {t.description}</span>}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: checked ? 'var(--primary-color)' : 'var(--text-muted)' }}>
                  Rp {Number(entry?.price_override ?? t.price).toLocaleString('id-ID')}{t.is_recurring ? '/bln' : ''}
                </span>
              </label>
              {checked && (
                <div style={{ marginLeft: '2rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Override harga:</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem' }}>Rp</span>
                    <input type="number" min="0" style={{ paddingLeft: '1.75rem', paddingRight: '0.5rem', paddingTop: '4px', paddingBottom: '4px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: '0.78rem', width: '120px' }} placeholder={String(t.price)} value={entry?.price_override ?? ''} onChange={e => setOverride(t.id, e.target.value)} />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>kosongkan = harga default</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {addonTotal > 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total layanan tambahan</span>
          <strong style={{ color: 'var(--primary-color)' }}>+ Rp {addonTotal.toLocaleString('id-ID')}/bln</strong>
        </div>
      )}
    </div>
  )
}

const PSBPage = ({
  openWlPicker,
  selectedWlEntry,
  setSelectedWlEntry,
  newUser,
  setNewUser,
  formWarnings,
  setFormWarnings,
  wizardStep,
  setWizardStep,
  handleCreateUser,
  validateStep1,
  psbSubmitting,
  ktpPhoto,
  setKtpPhoto,
  handleKtpSelect,
  wilayahData,
  selWilayah,
  setSelWilayah,
  handleSelWilayah,
  territories,
  profiles,
  formatSpeed,
  mtConfigs,
  waitingList = [],
  psbAddons = [],
  setPsbAddons = () => {},
  authHeader = () => ({}),
}) => {
  const { currentUser } = useAuthCtx()
  const { showToast } = useUICtx()
  const { navigateTo } = useNavCtx()

  const isTechnician = currentUser?.role === 'technician'
  // Flag eksplisit — hanya true saat user benar-benar klik pilih dusun (hindari iOS auto-select bug)
  const [kolektorPicked, setKolektorPicked] = useState(false)
  const maxStep = isTechnician ? 2 : 3

  const handlePhoneChange = (val) => {
    val = val.replace(/\D/g, '') // hanya angka
    if (val.startsWith('0') && val.length > 1) val = '62' + val.slice(1)
    setNewUser(u => ({ ...u, phone: val }))
    setFormWarnings(w => ({ ...w, phone: '' }))
  }

  // Cek apakah NIK atau no HP sudah ada di Waiting List
  const wlConflict = (() => {
    const nik = newUser.identity_number?.trim()
    const phone = newUser.phone?.trim()
    if (!nik && !phone) return null
    return waitingList.find(w =>
      w.status === 'waiting' && (
        (nik && w.identity_number && w.identity_number === nik) ||
        (phone && w.phone && w.phone === phone)
      )
    ) || null
  })()

  // hasTerritory: user pilih manual ATAU dari WL yang sudah punya territory
  const hasTerritory = kolektorPicked || !!(selectedWlEntry && newUser.territory_area_id)

  const validateTechStep1 = () => {
    if (!hasTerritory) { showToast('Wilayah / kolektor wajib dipilih', 'error'); return false }
    if (!newUser.groupname) { showToast('Paket internet wajib dipilih', 'error'); return false }
    if (!newUser.username.trim()) { showToast('Username PPPoE wajib diisi', 'error'); return false }
    if (!newUser.password.trim()) { showToast('Password PPPoE wajib diisi', 'error'); return false }
    if (!newUser.nas_id) { showToast('NAS/Router wajib dipilih', 'error'); return false }
    if (!newUser.latitude || !newUser.longitude) { showToast('Koordinat lokasi pelanggan wajib diisi — tekan tombol GPS', 'error'); return false }
    if (wlConflict) { showToast(`NIK/No HP ini sudah ada di Waiting List atas nama "${wlConflict.fullname}". Gunakan tombol Pilih dari Waiting List.`, 'error'); return false }
    return true
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (wizardStep === maxStep) {
      handleCreateUser(e)
    } else if (wizardStep === 1) {
      if (isTechnician) { if (validateTechStep1()) setWizardStep(2) }
      else { if (validateStep1()) setWizardStep(2) }
    } else {
      setWizardStep(wizardStep + 1)
    }
  }

  return (
    <div className="psb-page animate-fade-in">
      {/* Page Header */}
      <div className="psb-page-header">
        <button type="button" className="btn btn-outline psb-back-btn" onClick={() => { navigateTo('dashboard'); setWizardStep(1); setFormWarnings({ phone: '', nik: '' }); setSelectedWlEntry(null) }}>
          <ChevronLeft size={18} /> Kembali
        </button>
        <div>
          <h2 className="psb-page-title">Registrasi Pelanggan Baru</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>PSB — Pasang Baru</p>
        </div>
        <button type="button" className="btn btn-outline psb-wl-btn" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          onClick={openWlPicker}>
          <ClipboardList size={16} /><span className="psb-wl-label">Pilih dari Waiting List</span>
        </button>
      </div>

      {/* Banner jika diisi dari waiting list */}
      {selectedWlEntry && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ClipboardList size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#f59e0b' }}>Data dari Waiting List</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>— {selectedWlEntry.fullname}</span>
          </div>
          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}
            onClick={() => setSelectedWlEntry(null)}>✕</button>
        </div>
      )}

      {/* Wizard Steps */}
      <div className="wizard-steps" style={{ marginBottom: '1.5rem' }}>
        {isTechnician ? (<>
          <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Data Koneksi</div>
          </div>
          <div className="step-line" />
          <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Review</div>
          </div>
        </>) : (<>
          <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Data Pelanggan</div>
          </div>
          <div className="step-line" />
          <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Data Pembayaran</div>
          </div>
          <div className="step-line" />
          <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Data Secret</div>
          </div>
        </>)}
      </div>

      {/* Form Card */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <form onSubmit={handleFormSubmit}>

          {/* === ADMIN: Step 1 — Data Pelanggan === */}
          {!isTechnician && wizardStep === 1 && (
            <div className="animate-fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Nama Lengkap <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.fullname} onChange={e => setNewUser({ ...newUser, fullname: e.target.value })} placeholder="Sesuai KTP" required />
                </div>
                <div className="form-group">
                  <label>No HP / WhatsApp <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="tel" inputMode="numeric" className="search-input" style={{ width: '100%', paddingLeft: '1rem', borderColor: formWarnings.phone ? '#f59e0b' : '' }}
                    value={newUser.phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    placeholder="628123456789" />
                  {formWarnings.phone && <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '0.3rem' }}>{formWarnings.phone}</div>}
                </div>
                <div className="form-group">
                  <label>No Identitas (NIK) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" inputMode="numeric" className="search-input" style={{ width: '100%', paddingLeft: '1rem', borderColor: formWarnings.nik ? (formWarnings.nik.startsWith('⚠️') ? '#f59e0b' : '#ef4444') : '' }}
                    value={newUser.identity_number}
                    maxLength={16}
                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 16); setNewUser({ ...newUser, identity_number: v }); setFormWarnings(w => ({ ...w, nik: '' })) }}
                    placeholder="3201xxxxxxxxxxxx" maxLength={16} />
                  {formWarnings.nik && <div style={{ fontSize: '0.78rem', color: formWarnings.nik.startsWith('⚠️') ? '#f59e0b' : '#ef4444', marginTop: '0.3rem' }}>{formWarnings.nik}</div>}
                </div>
                {/* Warning WL conflict */}
                {wlConflict && !selectedWlEntry && (
                  <div style={{ gridColumn: 'span 2', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: '700', color: '#ef4444' }}>⛔ NIK/No HP ada di Waiting List — </span>
                    <strong>{wlConflict.fullname}</strong> sudah terdaftar. Gunakan tombol <strong>"Pilih dari Waiting List"</strong>.
                  </div>
                )}
                {/* Foto KTP */}
                <div className="form-group">
                  <label>Foto KTP <span style={{ color: '#ef4444' }}>*</span></label>
                  {ktpPhoto ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={ktpPhoto} alt="KTP Preview" style={{ width: '100%', maxWidth: '280px', borderRadius: '8px', border: '2px solid #10b981', objectFit: 'cover', maxHeight: '140px' }} />
                      <button type="button" onClick={() => setKtpPhoto(null)} style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                      <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '4px' }}>✓ Foto siap ({Math.round(ktpPhoto.length * 0.75 / 1024)} KB)</div>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '1rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleKtpSelect} />
                      📷 Ambil foto / pilih gambar KTP
                    </label>
                  )}
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Alamat Pemasangan</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Provinsi <span style={{ color: '#ef4444' }}>*</span></small>
                      <SearchableSelect options={wilayahData.provinsi} value={selWilayah.prov} onSelect={(kode, nama) => handleSelWilayah('prov', kode, nama)} placeholder="Cari provinsi..." disabled={false} />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kabupaten / Kota</small>
                      <SearchableSelect options={wilayahData.kabupaten} value={selWilayah.kab} onSelect={(kode, nama) => handleSelWilayah('kab', kode, nama)} placeholder="Cari kabupaten..." disabled={!selWilayah.prov} />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kecamatan</small>
                      <SearchableSelect options={wilayahData.kecamatan} value={selWilayah.kec} onSelect={(kode, nama) => handleSelWilayah('kec', kode, nama)} placeholder="Cari kecamatan..." disabled={!selWilayah.kab} />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Kelurahan / Desa</small>
                      <SearchableSelect options={wilayahData.kelurahan} value={selWilayah.kel} onSelect={(kode, nama) => handleSelWilayah('kel', kode, nama)} placeholder="Cari kelurahan..." disabled={!selWilayah.kec} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Dusun / Kampung <span style={{ color: '#ef4444' }}>*</span></small>
                    <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Contoh: Cibogo, Sukamaju..." required value={selWilayah.dusun} onChange={e => setSelWilayah(s => ({ ...s, dusun: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RT <span style={{ color: '#ef4444' }}>*</span></small>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="001" required value={selWilayah.rt} onChange={e => setSelWilayah(s => ({ ...s, rt: e.target.value }))} />
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RW <span style={{ color: '#ef4444' }}>*</span></small>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="005" required value={selWilayah.rw} onChange={e => setSelWilayah(s => ({ ...s, rw: e.target.value }))} />
                    </div>
                  </div>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} placeholder="Detail: Jl. Merdeka No. 5 (opsional)" value={selWilayah.detail} onChange={e => setSelWilayah(s => ({ ...s, detail: e.target.value }))} />
                  {composeAddress(selWilayah) && (
                    <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.65rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      📍 {composeAddress(selWilayah)}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📍 Koordinat Lokasi Pelanggan <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      — bantu kolektor navigasi ke rumah pelanggan
                    </span>
                  </label>
                  <MapPicker
                    lat={newUser.latitude}
                    lng={newUser.longitude}
                    onChange={(lat, lng) => setNewUser(u => ({ ...u, latitude: lat, longitude: lng }))}
                    gpsOnly={isTechnician}
                  />
                  {!newUser.latitude && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444' }}>
                      ⚠️ {isTechnician ? 'Tekan "Pakai GPS Saya" untuk mengisi koordinat' : 'Klik pada peta atau tekan "Pakai GPS Saya" untuk mengisi koordinat'}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Tanggal Pemasangan</label>
                  <input type="date" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} max={new Date().toISOString().split('T')[0]} value={newUser.install_date || new Date().toISOString().split('T')[0]} onChange={e => setNewUser({ ...newUser, install_date: e.target.value })} />
                </div>
                {newUser.territory_id && (
                  <div className="form-group">
                    <label>Wilayah / Territory</label>
                    <div className="search-input" style={{ width: '100%', paddingLeft: '1rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-secondary)' }}>
                      <MapPin size={13} />
                      {territories.find(t => String(t.id) === String(newUser.territory_id))?.name || '—'}
                      <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.7 }}>(otomatis dari desa)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === ADMIN: Step 2 — Data Pembayaran === */}
          {!isTechnician && wizardStep === 2 && (
            <div className="animate-fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Profile / Paket <span style={{ color: '#ef4444' }}>*</span></label>
                  <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.groupname} onChange={e => setNewUser({ ...newUser, groupname: e.target.value })} required>
                    <option value="">-- Pilih Paket --</option>
                    {profiles.map(p => <option key={p.id} value={p.name}>{p.name}{p.rate_limit ? ` (${formatSpeed(p.rate_limit)})` : ''}{p.price ? ` — Rp ${Number(p.price).toLocaleString('id-ID')}` : ''}</option>)}
                  </select>
                  {newUser.groupname && (() => { const p = profiles.find(x => x.name === newUser.groupname); return p?.price ? <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600' }}>💰 Tagihan bulanan: Rp {Number(p.price).toLocaleString('id-ID')}</div> : null })()}
                </div>
                <div className="form-group">
                  <label>Tanggal Jatuh Tempo</label>
                  <input type="number" min="1" max="31" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.due_date_day} onChange={e => setNewUser({ ...newUser, due_date_day: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(opsional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Rp</span>
                    <input type="number" min="0" className="search-input" style={{ width: '100%', paddingLeft: '2.5rem' }} value={newUser.discount || ''} onChange={e => setNewUser({ ...newUser, discount: e.target.value })} placeholder="0" />
                  </div>
                  {parseInt(newUser.discount) > 0 && (() => { const p = profiles.find(x => x.name === newUser.groupname); const base = p?.price || 0; const net = Math.max(0, base - parseInt(newUser.discount || 0)); return <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--primary-color)' }}>Tagihan jadi: <strong>Rp {net.toLocaleString('id-ID')}</strong>/bln</div> })()}
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Alasan Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(opsional)</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.discount_note || ''} onChange={e => setNewUser({ ...newUser, discount_note: e.target.value })} placeholder="cth: Ketua RT, warga kurang mampu, dll" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>💳 Tipe Tagihan</label>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {[{ val: 'prepaid', label: '💰 Prabayar', desc: 'Bayar dulu, baru aktif' }, { val: 'postpaid', label: '📋 Pascabayar', desc: 'Pakai dulu, bayar belakangan' }].map(opt => (
                      <label key={opt.val} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 1rem', borderRadius: '8px', border: `2px solid ${(newUser.billing_type || 'prepaid') === opt.val ? 'var(--primary-color)' : 'var(--border-color)'}`, background: (newUser.billing_type || 'prepaid') === opt.val ? 'rgba(37,99,235,0.06)' : 'transparent', cursor: 'pointer' }}>
                        <input type="radio" value={opt.val} checked={(newUser.billing_type || 'prepaid') === opt.val} onChange={() => setNewUser({ ...newUser, billing_type: opt.val })} style={{ display: 'none' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{opt.label}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <PsbAddonSelector addons={psbAddons} setAddons={setPsbAddons} authHeader={authHeader} />
            </div>
          )}

          {/* === ADMIN: Step 3 — Data Secret === */}
          {!isTechnician && wizardStep === 3 && (
            <div className="animate-fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>Tipe Koneksi</label>
                  <select
                    className="search-input"
                    style={{ width: '100%' }}
                    value={newUser.connection_type || 'pppoe'}
                    onChange={e => setNewUser({ ...newUser, connection_type: e.target.value, username: '', password: '', staticIp: '' })}
                  >
                    <option value="pppoe">PPPoE</option>
                    <option value="static">Static IP (ARP)</option>
                    <option value="hotspot">Static IP (Hotspot Binding)</option>
                  </select>
                </div>
                {(newUser.connection_type || 'pppoe') === 'pppoe' ? (
                  <>
                    <div className="form-group">
                      <label>Username PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })} placeholder="Username PPPoE (tanpa spasi)" required />
                    </div>
                    <div className="form-group">
                      <label>Password PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password PPPoE" required />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Nama Identifikasi <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })} placeholder="ID unik pelanggan (tanpa spasi)" required />
                    </div>
                    <div className="form-group">
                      <label>IP Address Static <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.staticIp} onChange={e => setNewUser({ ...newUser, staticIp: e.target.value })} placeholder="Contoh: 192.168.60.100" required />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label>ODP (Reference)</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.odp} onChange={e => setNewUser({ ...newUser, odp: e.target.value })} placeholder="Contoh: ODP-01-GRD" />
                </div>
                <div className="form-group">
                  <label>NAS / Router <span style={{ color: '#ef4444' }}>*</span></label>
                  <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.nas_id} onChange={e => setNewUser({ ...newUser, nas_id: e.target.value })} required>
                    <option value="">-- Pilih Router --</option>
                    {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#166534', fontWeight: '700', marginBottom: '8px' }}>
                  <CheckCircle size={20} /> Konfirmasi Pendaftaran
                </div>
                <p style={{ fontSize: '0.875rem', color: '#166534', margin: 0 }}>
                  Semua data telah diisi. Klik "Daftarkan Pelanggan" untuk menyimpan ke sistem.
                </p>
              </div>
            </div>
          )}

          {/* === TEKNISI: Step 1 — Data Koneksi (PPPoE + Paket) === */}
          {isTechnician && wizardStep === 1 && (
            <div className="animate-fade-in psb-tech-form">
              {/* Warning: NIK/HP ada di Waiting List */}
              {wlConflict && !selectedWlEntry && (
                <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#ef4444', marginBottom: '0.25rem' }}>⛔ NIK/No HP ada di Waiting List</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <strong>{wlConflict.fullname}</strong> sudah terdaftar di Waiting List. Gunakan tombol <strong>"Pilih dari Waiting List"</strong> di atas untuk melanjutkan pemasangan.
                  </div>
                </div>
              )}
              {/* Info data pelanggan dari WL */}
              {selectedWlEntry ? (
                <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px' }} className="wl-info-banner">
                  <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#10b981', marginBottom: '0.4rem' }}>✓ Data pelanggan sudah terisi dari Waiting List</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>👤 {newUser.fullname || '—'}</span>
                    <span>📞 {newUser.phone || '—'}</span>
                    <span>🪪 NIK: {newUser.identity_number || '—'}</span>
                    <span>📍 {newUser.address ? newUser.address.slice(0, 40) + (newUser.address.length > 40 ? '…' : '') : '—'}</span>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: '#d97706' }}>
                  ℹ️ Tidak ada data dari Waiting List. Pastikan kamu sudah memilih calon pelanggan lewat tombol <strong>Pilih dari Waiting List</strong> di atas.
                </div>
              )}
              {/* Pilih Wilayah / Kolektor */}
              {(() => {
                const allAreas = territories.flatMap(t => (t.areas || []).map(a => ({ ...a, territory_name: t.name })))
                const hasAreas = allAreas.length > 0
                return (
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label>🧑‍💼 Wilayah / Kolektor {hasAreas && <span style={{ color: '#ef4444' }}>*</span>}</label>
                    {!hasAreas ? (
                      <div style={{ padding: '0.6rem 0.875rem', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Belum ada dusun/kolektor terdaftar — <span style={{ fontStyle: 'italic' }}>opsional, bisa diatur nanti di menu Wilayah</span>
                      </div>
                    ) : newUser.territory_area_id ? (() => {
                      const sel = allAreas.find(a => String(a.id) === String(newUser.territory_area_id))
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 0.875rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
                          <span>✅</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{sel?.dusun_nama || sel?.name || '—'}</div>
                            {sel?.collector_name && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Kolektor: {sel.collector_name}</div>}
                          </div>
                          <button type="button" onClick={() => { setNewUser(u => ({ ...u, territory_area_id: '', territory_id: '' })); setKolektorPicked(false) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ganti</button>
                        </div>
                      )
                    })() : (() => {
                      const groups = {}
                      allAreas.forEach(a => {
                        const key = a.collector_name || 'Tanpa Kolektor'
                        if (!groups[key]) groups[key] = []
                        groups[key].push(a)
                      })
                      return (
                        <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                          value={newUser.territory_area_id}
                          onChange={e => {
                            if (!e.target.value) return
                            const area = allAreas.find(a => String(a.id) === e.target.value)
                            setKolektorPicked(true)
                            setNewUser(u => ({ ...u, territory_area_id: e.target.value, territory_id: area ? String(area.territory_id || '') : '' }))
                          }}>
                          <option value="">-- Pilih Dusun / Kolektor --</option>
                          {Object.entries(groups).map(([collector, areas]) => (
                            <optgroup key={collector} label={`KOLEKTOR: ${collector.toUpperCase()}`}>
                              {areas.map(a => (
                                <option key={a.id} value={String(a.id)}>{a.dusun_nama || a.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )
                    })()}
                  </div>
                )
              })()}

              <div className="psb-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Profile / Paket <span style={{ color: '#ef4444' }}>*</span></label>
                  {selectedWlEntry?.groupname && newUser.groupname ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 0.875rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
                      <span>✅</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{newUser.groupname}</div>
                        {(() => { const p = profiles.find(x => x.name === newUser.groupname); return p?.price ? <div style={{ fontSize: '0.78rem', color: 'var(--primary-color)', fontWeight: '600' }}>💰 Rp {Number(p.price).toLocaleString('id-ID')}/bulan</div> : null })()}
                      </div>
                      <button type="button" onClick={() => setNewUser(u => ({ ...u, groupname: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ganti</button>
                    </div>
                  ) : (
                    <>
                      <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.groupname} onChange={e => setNewUser({ ...newUser, groupname: e.target.value })} required>
                        <option value="">-- Pilih Paket --</option>
                        {profiles.map(p => <option key={p.id} value={p.name}>{p.name}{p.rate_limit ? ` (${formatSpeed(p.rate_limit)})` : ''}{p.price ? ` — Rp ${Number(p.price).toLocaleString('id-ID')}` : ''}</option>)}
                      </select>
                      {newUser.groupname && (() => { const p = profiles.find(x => x.name === newUser.groupname); return p?.price ? <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600' }}>💰 Tagihan bulanan: Rp {Number(p.price).toLocaleString('id-ID')}</div> : null })()}
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label>Username PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value.replace(/\s/g, '') })} placeholder="Username PPPoE (tanpa spasi)" required />
                </div>
                <div className="form-group">
                  <label>Password PPPoE <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password PPPoE" required />
                </div>
                <div className="form-group">
                  <label>NAS / Router <span style={{ color: '#ef4444' }}>*</span></label>
                  <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }} value={newUser.nas_id} onChange={e => setNewUser({ ...newUser, nas_id: e.target.value })} required>
                    <option value="">-- Pilih Router --</option>
                    {mtConfigs.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>ODP (Reference)</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.odp} onChange={e => setNewUser({ ...newUser, odp: e.target.value })} placeholder="Contoh: ODP-01-GRD" />
                </div>
              </div>
              {/* GPS + Dates — part of step 1 for technician */}
              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Koordinat Lokasi <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {selectedWlEntry?.latitude && newUser.latitude ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 0.875rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
                    <span>✅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{Number(newUser.latitude).toFixed(6)}, {Number(newUser.longitude).toFixed(6)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Koordinat dari Waiting List</div>
                    </div>
                    <a href={`https://www.google.com/maps?q=${newUser.latitude},${newUser.longitude}`} target="_blank" rel="noreferrer"
                      style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Cek Maps</a>
                    <button type="button" onClick={() => setNewUser(u => ({ ...u, latitude: '', longitude: '' }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ganti</button>
                  </div>
                ) : (
                  <>
                    <MapPicker
                      lat={newUser.latitude}
                      lng={newUser.longitude}
                      onChange={(lat, lng) => setNewUser(u => ({ ...u, latitude: lat, longitude: lng }))}
                      gpsOnly={isTechnician}
                    />
                    {!newUser.latitude && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444' }}>
                        ⚠️ {isTechnician ? 'Tekan "Pakai GPS Saya" untuk mengisi koordinat' : 'Klik pada peta atau tekan "Pakai GPS Saya" untuk mengisi koordinat'}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="psb-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="form-group">
                  <label>Tanggal Pemasangan</label>
                  <input type="date" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} max={new Date().toISOString().split('T')[0]} value={newUser.install_date || new Date().toISOString().split('T')[0]} onChange={e => setNewUser({ ...newUser, install_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Tanggal Jatuh Tempo</label>
                  <input type="number" min="1" max="31" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.due_date_day} onChange={e => setNewUser({ ...newUser, due_date_day: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(opsional)</span></label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Rp</span>
                    <input type="number" min="0" className="search-input" style={{ width: '100%', paddingLeft: '2.5rem' }} value={newUser.discount || ''} onChange={e => setNewUser({ ...newUser, discount: e.target.value })} placeholder="0" />
                  </div>
                  {parseInt(newUser.discount) > 0 && (() => { const p = profiles.find(x => x.name === newUser.groupname); const base = p?.price || 0; const net = Math.max(0, base - parseInt(newUser.discount || 0)); return <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--primary-color)' }}>Tagihan jadi: <strong>Rp {net.toLocaleString('id-ID')}</strong>/bln</div> })()}
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Alasan Diskon <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(opsional)</span></label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }} value={newUser.discount_note || ''} onChange={e => setNewUser({ ...newUser, discount_note: e.target.value })} placeholder="cth: Ketua RT, warga kurang mampu, dll" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>💳 Tipe Tagihan</label>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {[{ val: 'prepaid', label: '💰 Prabayar', desc: 'Bayar dulu, baru aktif' }, { val: 'postpaid', label: '📋 Pascabayar', desc: 'Pakai dulu, bayar belakangan' }].map(opt => (
                      <label key={opt.val} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 1rem', borderRadius: '8px', border: `2px solid ${(newUser.billing_type || 'prepaid') === opt.val ? 'var(--primary-color)' : 'var(--border-color)'}`, background: (newUser.billing_type || 'prepaid') === opt.val ? 'rgba(37,99,235,0.06)' : 'transparent', cursor: 'pointer' }}>
                        <input type="radio" value={opt.val} checked={(newUser.billing_type || 'prepaid') === opt.val} onChange={() => setNewUser({ ...newUser, billing_type: opt.val })} style={{ display: 'none' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{opt.label}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === TEKNISI: Step 2 — Review === */}
          {isTechnician && wizardStep === 2 && (
            <div className="animate-fade-in">
              <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Pastikan semua data sudah benar sebelum mendaftarkan pelanggan.
              </div>
              {/* Customer data from WL */}
              {selectedWlEntry && (
                <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.78rem', color: '#10b981', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>👤 Data Pelanggan (Waiting List)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Nama</span><br /><strong>{newUser.fullname || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No HP</span><br /><strong>{newUser.phone || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>NIK</span><br /><strong>{newUser.identity_number || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Alamat</span><br /><strong style={{ fontSize: '0.78rem' }}>{newUser.address ? newUser.address.slice(0, 60) + (newUser.address.length > 60 ? '…' : '') : '—'}</strong></div>
                  </div>
                </div>
              )}
              {/* Wilayah / Kolektor */}
              {newUser.territory_area_id && (() => {
                const allAreas = territories.flatMap(t => (t.areas || []).map(a => ({ ...a })))
                const sel = allAreas.find(a => String(a.id) === String(newUser.territory_area_id))
                return sel ? (
                  <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.78rem', color: '#8b5cf6', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🧑‍💼 Wilayah & Kolektor</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                      <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Dusun</span><br /><strong>{sel.dusun_nama || sel.name || '—'}</strong></div>
                      <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Kolektor</span><br /><strong>{sel.collector_name || '—'}</strong></div>
                    </div>
                  </div>
                ) : null
              })()}
              {/* Connection data */}
              <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.78rem', color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🔌 Data Koneksi</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Paket</span><br /><strong>{newUser.groupname || '—'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Tipe Koneksi</span><br /><strong>{newUser.connection_type === 'hotspot' ? 'Static IP (Hotspot Binding)' : newUser.connection_type === 'static' ? 'Static IP (ARP)' : 'PPPoE'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>NAS / Router</span><br /><strong>{mtConfigs.find(c => String(c.id) === String(newUser.nas_id))?.name || mtConfigs.find(c => String(c.id) === String(newUser.nas_id))?.host || '—'}</strong></div>
                  {(newUser.connection_type || 'pppoe') === 'pppoe' ? (<>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Username PPPoE</span><br /><strong>{newUser.username || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Password PPPoE</span><br /><strong>{newUser.password || '—'}</strong></div>
                  </>) : (<>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ID Pelanggan</span><br /><strong>{newUser.username || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>IP Address</span><br /><strong>{newUser.staticIp || '—'}</strong></div>
                    {newUser.macAddress && <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>MAC Address</span><br /><strong>{newUser.macAddress}</strong></div>}
                  </>)}
                  {newUser.odp && <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ODP</span><br /><strong>{newUser.odp}</strong></div>}
                </div>
              </div>
              {/* PPP Secret checkbox — hanya muncul jika router mode RADIUS dan tipe PPPoE */}
              {(() => {
                const selectedRouter = mtConfigs.find(c => String(c.id) === String(newUser.nas_id))
                if (selectedRouter?.auth_mode !== 'radius') return null
                if (newUser.connection_type === 'static' || newUser.connection_type === 'hotspot') return null
                return (
                  <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!newUser.create_ppp_secret}
                        onChange={e => setNewUser({ ...newUser, create_ppp_secret: e.target.checked })}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Buat PPP Secret di MikroTik
                      </span>
                    </label>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.76rem', color: 'var(--text-muted)', paddingLeft: '1.65rem' }}>
                      Router ini menggunakan mode RADIUS. PPP Secret bersifat opsional — centang jika ingin menyimpan cadangan di MikroTik.
                    </div>
                  </div>
                )
              })()}
              {/* GPS + Dates */}
              <div style={{ marginBottom: '0.5rem', padding: '0.85rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.78rem', color: '#d97706', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>📍 Lokasi & Jadwal</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Koordinat GPS</span><br />
                    <strong>{newUser.latitude && newUser.longitude ? `${Number(newUser.latitude).toFixed(6)}, ${Number(newUser.longitude).toFixed(6)}` : <span style={{ color: '#ef4444' }}>⚠️ Belum diisi</span>}</strong>
                  </div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Tanggal Pemasangan</span><br /><strong>{newUser.install_date || new Date().toISOString().split('T')[0]}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Jatuh Tempo Tgl</span><br /><strong>{newUser.due_date_day || '—'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Tipe Tagihan</span><br /><strong>{newUser.billing_type === 'postpaid' ? '📋 Pascabayar' : '💰 Prabayar'}</strong></div>
                  {parseInt(newUser.discount) > 0 && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Diskon</span><br />
                      <strong style={{ color: '#b45309' }}>🏷️ Rp {parseInt(newUser.discount).toLocaleString('id-ID')}</strong>
                      {newUser.discount_note && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({newUser.discount_note})</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            {wizardStep > 1 && (
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setWizardStep(wizardStep - 1)}>Kembali</button>
            )}
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { navigateTo('dashboard'); setWizardStep(1); setFormWarnings({ phone: '', nik: '' }) }}>Batal</button>
            {(() => {
              const techStep1 = isTechnician && wizardStep === 1
              const noKolektor = techStep1 && !hasTerritory
              const noGps = techStep1 && (!newUser.latitude || !newUser.longitude)
              const isDisabled = (wizardStep === maxStep && psbSubmitting) || noKolektor || noGps
              const label = wizardStep === maxStep && psbSubmitting
                ? '⏳ Menyimpan...'
                : noKolektor
                  ? '🧑‍💼 Pilih kolektor dulu'
                  : noGps
                    ? '📍 Tunggu GPS terisi dulu'
                    : wizardStep === maxStep
                      ? 'Daftarkan Pelanggan'
                      : 'Selanjutnya →'
              return (
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isDisabled}>
                  {label}
                </button>
              )
            })()}
          </div>
        </form>
      </div>
    </div>
  )
}

export default PSBPage
