import { useState } from 'react'
import { CreditCard, MessageSquare, CircleDollarSign, Send, ChevronDown } from 'lucide-react'

const WA_PRESETS = {
  fonnte: { label: 'Fonnte', url: 'https://api.fonnte.com/send', phone_key: 'target', message_key: 'message', auth_header: 'Authorization' },
  wablas: { label: 'Wablas', url: 'https://solo.wablas.com/api/send-message', phone_key: 'phone', message_key: 'message', auth_header: 'Authorization' },
  dripsender: { label: 'Dripsender', url: 'https://app.dripsender.id/api/send', phone_key: 'phone', message_key: 'text', auth_header: 'apikey' },
  kirimi: { label: 'Kirimi.id', url: 'https://kirimi.id/api/v1/wa/send', phone_key: 'wa_number', message_key: 'pesan', auth_header: 'token' },
}

const WA_VARS = ['{nama}', '{tagihan}', '{periode}', '{jatuh_tempo}', '{paket}', '{no_invoice}', '{link_bayar}']

export default function SettingsBillingPage({
  settingsForm,
  setSettingsForm,
  applyToAll,
  setApplyToAll,
  applyToAllLoading,
  handleSaveSettings,
  fetchPGConfig,
  setShowPGSettingsModal,
  authHeader,
  showToast,
}) {
  const [testPhone, setTestPhone] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const applyPreset = (key) => {
    const p = WA_PRESETS[key]
    setSettingsForm(f => ({ ...f, wa_api_url: p.url, wa_phone_key: p.phone_key, wa_message_key: p.message_key, wa_auth_header: p.auth_header }))
  }

  const handleTestWa = async () => {
    if (!testPhone) return showToast?.('Isi nomor HP dulu', 'error')
    setTestLoading(true)
    try {
      const res = await fetch('/api/wa/test', {
        method: 'POST',
        headers: { ...authHeader?.(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, message: settingsForm.wa_template_tagihan?.replace(/{[^}]+}/g, '(contoh)') || 'Test pesan dari PMY NET ISP' }),
      })
      const d = await res.json()
      if (res.ok) showToast?.('✅ Pesan test berhasil dikirim!', 'success')
      else showToast?.(d.error || 'Gagal kirim', 'error')
    } catch { showToast?.('Gagal konek ke server', 'error') }
    finally { setTestLoading(false) }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp & Penagihan</h1>
          <p className="page-description">Konfigurasi pusat notifikasi dan kebijakan jatuh tempo.</p>
        </div>
        <button className="btn btn-teal" onClick={() => { fetchPGConfig(); setShowPGSettingsModal(true) }}>
          <CreditCard size={16} /> Konfigurasi Payment Gateway
        </button>
      </div>

      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {/* WhatsApp */}
        <section className="card" style={{ padding: '1.5rem', gridColumn: 'span 2' }}>
          <div className="card-header" style={{ border: 'none', padding: 0, marginBottom: '1.25rem' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MessageSquare className="text-success" /> Gateway WhatsApp
            </h2>
          </div>
          <form onSubmit={handleSaveSettings}>
            {/* Preset buttons */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Preset Gateway</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {Object.entries(WA_PRESETS).map(([key, p]) => (
                  <button key={key} type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.35rem 1rem' }} onClick={() => applyPreset(key)}>
                    {p.label}
                  </button>
                ))}
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>— atau konfigurasi manual di bawah</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>API URL Endpoint</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={settingsForm.wa_api_url || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, wa_api_url: e.target.value })}
                  placeholder="https://api.fonnte.com/send" />
              </div>
              <div className="form-group">
                <label>API Key / Token</label>
                <input type="password" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={settingsForm.wa_api_key || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, wa_api_key: e.target.value })}
                  placeholder="Token rahasia Anda..." />
              </div>
            </div>

            {/* Advanced toggle */}
            <button type="button" onClick={() => setShowAdvanced(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)', fontSize: '0.82rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.75rem', padding: 0 }}>
              <ChevronDown size={14} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
              {showAdvanced ? 'Sembunyikan' : 'Pengaturan lanjutan (field name, delay, dll)'}
            </button>

            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Field Nomor HP</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '0.75rem' }}
                    value={settingsForm.wa_phone_key || 'target'}
                    onChange={e => setSettingsForm({ ...settingsForm, wa_phone_key: e.target.value })}
                    placeholder="target" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Field Pesan</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '0.75rem' }}
                    value={settingsForm.wa_message_key || 'message'}
                    onChange={e => setSettingsForm({ ...settingsForm, wa_message_key: e.target.value })}
                    placeholder="message" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Header Auth</label>
                  <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '0.75rem' }}
                    value={settingsForm.wa_auth_header || 'Authorization'}
                    onChange={e => setSettingsForm({ ...settingsForm, wa_auth_header: e.target.value })}
                    placeholder="Authorization" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Delay Blast (ms)</label>
                  <input type="number" min="500" max="30000" className="search-input" style={{ width: '100%', paddingLeft: '0.75rem' }}
                    value={settingsForm.wa_delay_ms || '3000'}
                    onChange={e => setSettingsForm({ ...settingsForm, wa_delay_ms: e.target.value })}
                    placeholder="3000" />
                </div>
              </div>
            )}

            {/* Template */}
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Template Pesan Tagihan</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>Variabel yang tersedia:</span>
              </label>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {WA_VARS.map(v => (
                  <span key={v} onClick={() => setSettingsForm(f => ({ ...f, wa_template_tagihan: (f.wa_template_tagihan || '') + v }))}
                    style={{ fontSize: '0.72rem', background: 'rgba(37,99,235,0.1)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: '600', userSelect: 'none' }}
                    title="Klik untuk sisipkan">
                    {v}
                  </span>
                ))}
              </div>
              <textarea rows={7} className="search-input" style={{ width: '100%', paddingLeft: '1rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
                value={settingsForm.wa_template_tagihan || ''}
                onChange={e => setSettingsForm({ ...settingsForm, wa_template_tagihan: e.target.value })}
                placeholder="Tulis template pesan di sini..." />
            </div>

            {/* Test send */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', padding: '0.875rem 1rem', background: 'rgba(16,185,129,0.06)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="form-group" style={{ flex: 1, margin: 0 }}>
                <label style={{ fontSize: '0.82rem' }}>Test Kirim (nomor HP kamu)</label>
                <input type="text" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="628xxxxxxxxxx" />
              </div>
              <button type="button" className="btn btn-outline" style={{ whiteSpace: 'nowrap', borderColor: '#10b981', color: '#10b981' }}
                onClick={handleTestWa} disabled={testLoading}>
                <Send size={14} /> {testLoading ? 'Mengirim...' : 'Kirim Test'}
              </button>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Simpan Konfigurasi WA</button>
          </form>
        </section>

        {/* Kebijakan Isolir */}
        <section className="card" style={{ padding: '1.5rem' }}>
          <div className="card-header" style={{ border: 'none', padding: 0, marginBottom: '1.5rem' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CircleDollarSign className="text-primary" /> Kebijakan Isolir
            </h2>
          </div>
          <form onSubmit={handleSaveSettings}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Tanggal Jatuh Tempo Default (1-31)</label>
                <input type="number" min="1" max="31" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={settingsForm.default_due_date || '5'}
                  onChange={e => setSettingsForm({ ...settingsForm, default_due_date: e.target.value })} />
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Berlaku untuk pelanggan baru.</small>
              </div>
              <div className="form-group">
                <label>Jam Isolir Setelah Jatuh Tempo</label>
                <select className="search-input" style={{ width: '100%', paddingLeft: '0.75rem', background: 'var(--bg-surface)' }}
                  value={settingsForm.isolate_hour || '1'}
                  onChange={e => setSettingsForm({ ...settingsForm, isolate_hour: e.target.value })}>
                  {[1,2,3,4,5,6].map(h => (
                    <option key={h} value={String(h)}>Jam {String(h).padStart(2,'0')}.00 WIB ({h === 1 ? '1 jam' : `${h} jam`} setelah tengah malam)</option>
                  ))}
                </select>
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Isolir berjalan saat cron jam tersebut.</small>
              </div>
              <div className="form-group">
                <label>Grace Period Pascabayar (hari)</label>
                <input type="number" min="0" max="60" className="search-input" style={{ width: '100%', paddingLeft: '1rem' }}
                  value={settingsForm.postpaid_grace_days || '7'}
                  onChange={e => setSettingsForm({ ...settingsForm, postpaid_grace_days: e.target.value })} />
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Pelanggan pascabayar diisolir N hari setelah jatuh tempo.</small>
              </div>
            </div>

            <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'rgba(234,179,8,0.08)', borderRadius: '10px', border: '1px solid rgba(234,179,8,0.25)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
                  checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Terapkan ke semua pelanggan aktif</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Akan mengupdate <strong>tanggal jatuh tempo</strong> dan <strong>pengaturan isolir otomatis</strong> untuk semua pelanggan aktif sesuai nilai di atas. Tidak bisa dibatalkan.
                  </div>
                </div>
              </label>
            </div>

            <div className="toggle-box muted-container" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox" style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                checked={settingsForm.auto_isolate_enabled === '1'}
                onChange={e => setSettingsForm({ ...settingsForm, auto_isolate_enabled: e.target.checked ? '1' : '0' })} />
              <div>
                <div style={{ fontWeight: '600' }}>Isolir Otomatis</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Matikan internet pelanggan yang belum bayar pada jam yang dipilih di hari jatuh tempo.
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={applyToAllLoading}>
              {applyToAllLoading ? '⏳ Menerapkan...' : applyToAll ? '💾 Simpan & Terapkan ke Semua Pelanggan' : '💾 Simpan Kebijakan'}
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
