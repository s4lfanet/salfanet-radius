import { useState, useEffect, useRef } from 'react'
import { Building2, Upload, X, Save } from 'lucide-react'

export default function SuperAdminPlatformPage({ authHeader, showToast }) {
  const [form, setForm] = useState({ company_name: '', company_logo: '', company_address: '', company_phone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/super-admin/platform-settings', { headers: authHeader() })
        if (res.ok) {
          const data = await res.json()
          setForm(f => ({ ...f, ...data }))
        }
      } catch (_) {}
      setLoading(false)
    }
    load()
  }, [])

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 200 * 1024) {
      showToast('Logo terlalu besar. Maksimal 200 KB.', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setForm(f => ({ ...f, company_logo: ev.target.result }))
    reader.readAsDataURL(file)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/super-admin/platform-settings', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Pengaturan platform berhasil disimpan ke semua mitra', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Memuat...</div>

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan Platform</h1>
          <p className="page-description">Informasi ini diterapkan ke seluruh mitra — tampil di struk pembayaran setiap pelanggan.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 700 }}>
        <div className="card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} style={{ color: 'var(--primary)' }} /> Identitas Perusahaan
          </h2>

          {/* Logo */}
          <div className="form-group">
            <label>Logo Perusahaan</label>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 130, height: 90, border: '2px dashed var(--border-color)', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  background: 'var(--bg-secondary)', overflow: 'hidden', flexShrink: 0,
                }}>
                {form.company_logo
                  ? <img src={form.company_logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Upload size={22} />
                      <div style={{ fontSize: '0.72rem', marginTop: '5px' }}>Klik untuk upload</div>
                    </div>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                <button type="button" className="btn btn-outline" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> Pilih Gambar
                </button>
                {form.company_logo && (
                  <button type="button" className="btn btn-outline"
                    style={{ fontSize: '0.82rem', color: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setForm(f => ({ ...f, company_logo: '' }))}>
                    <X size={14} /> Hapus Logo
                  </button>
                )}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PNG/JPG/SVG, maks 200 KB</span>
              </div>
            </div>
          </div>

          {/* Nama */}
          <div className="form-group">
            <label>Nama Perusahaan</label>
            <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
              value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              placeholder="Contoh: PMY NET ISP" />
          </div>

          {/* Alamat HO */}
          <div className="form-group">
            <label>Alamat HO / Head Office</label>
            <textarea rows={2} className="search-input"
              style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              value={form.company_address}
              onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
              placeholder="Jl. Contoh No. 1, Kecamatan, Kota" />
          </div>

          {/* Telepon */}
          <div className="form-group">
            <label>Nomor Telepon / WhatsApp</label>
            <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
              value={form.company_phone}
              onChange={e => setForm(f => ({ ...f, company_phone: e.target.value }))}
              placeholder="08xx-xxxx-xxxx" />
          </div>

          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(59,130,246,0.07)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--primary)' }}>
            Perubahan ini akan diterapkan ke <strong>semua mitra</strong> sekaligus dan langsung tampil di struk pembayaran.
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} disabled={saving}>
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan & Terapkan ke Semua Mitra'}
          </button>
        </div>
      </form>
    </div>
  )
}
