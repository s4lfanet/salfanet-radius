import { useState, useRef } from 'react'

export function useMikrotik({ authHeader, showToast, requestConfirm, fetchData, ipPools }) {
  // Ref untuk menyimpan active tenant ID (super admin context) — diset dari App.jsx
  const activeTenantRef = useRef(null)
  const [mtConfigs, setMtConfigs] = useState([])
  const [mtLoading, setMtLoading] = useState(true)
  const [mtProfiles, setMtProfiles] = useState([])
  const [routerStatus, setRouterStatus] = useState({})
  const [showAddMtModal, setShowAddMtModal] = useState(false)
  const [showMtScriptModal, setShowMtScriptModal] = useState(false)
  const [scriptNas, setScriptNas] = useState(null)
  const [scriptConfig, setScriptConfig] = useState({ server_ip: '', gateway: '', ifaces: ['ether1'], ros_version: 'v7', pools: [] })
  const [scriptGenerated, setScriptGenerated] = useState(false)
  const [serverIpLoading, setServerIpLoading] = useState(false)
  const [editingMt, setEditingMt] = useState(null)
  const [newMtConfig, setNewMtConfig] = useState({ name: '', host: '', user: '', pass: '', port: 8728, radiusSecret: 'Mynet@2026', radiusNasIp: '', authMode: '' })
  const [showRouterPass, setShowRouterPass] = useState({})
  const [selectedRouterIds, setSelectedRouterIds] = useState([])

  // Silent status check — no toast
  const checkRouterStatusSilent = async (id) => {
    try {
      const res = await fetch(`/api/mikrotik/status/${id}`, { headers: authHeader() })
      const data = await res.json()
      setRouterStatus(prev => ({ ...prev, [id]: data }))
    } catch (err) {
      setRouterStatus(prev => ({ ...prev, [id]: { status: 'offline', error: 'Connection failed' } }))
    }
  }

  const checkRouterStatus = async (id) => {
    setRouterStatus(prev => ({ ...prev, [id]: { ...prev[id], status: 'checking' } }))
    try {
      const res = await fetch(`/api/mikrotik/status/${id}`, { headers: authHeader() })
      const data = await res.json()
      setRouterStatus(prev => ({ ...prev, [id]: data }))
      if (data.status === 'online') {
        showToast('Koneksi MikroTik Berhasil!', 'success')
      } else {
        showToast(data.error || 'Gagal terhubung ke MikroTik', 'error')
      }
    } catch (err) {
      setRouterStatus(prev => ({ ...prev, [id]: { status: 'offline', error: 'Connection failed' } }))
      showToast('Gagal menghubungi server backend', 'error')
    }
  }

  // Buka modal script — auto-fetch IP server, reset form
  const openScriptModal = async (nas) => {
    setScriptNas(nas)
    setScriptConfig({ server_ip: '', gateway: '', ifaces: ['ether1'], ros_version: 'v7', pools: [] })
    setScriptGenerated(false)
    setShowMtScriptModal(true)
    // Auto-fetch IP server RADIUS
    setServerIpLoading(true)
    try {
      const ipRes = await fetch('/api/server/ip', { headers: authHeader() }).catch(() => null)
      if (ipRes?.ok) {
        const { ip } = await ipRes.json()
        if (ip) setScriptConfig(prev => ({ ...prev, server_ip: ip }))
      }
    } catch (_) { }
    setServerIpLoading(false)
  }

  const handleAddMtConfig = async (e) => {
    e.preventDefault()
    try {
      const isEdit = !!editingMt
      const url = isEdit ? `/api/mikrotik/config/${editingMt.id}` : '/api/mikrotik/config'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ ...newMtConfig, radiusSecret: newMtConfig.radiusSecret.trim() || 'Mynet@2026', radiusNasIp: newMtConfig.radiusNasIp.trim() || null })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Gagal ${isEdit ? 'memperbarui' : 'menambah'} router`)
      const savedNas = { ...newMtConfig, radius_secret: newMtConfig.radiusSecret }
      setNewMtConfig({ name: '', host: '', user: '', pass: '', port: 8728, radiusSecret: 'Mynet@2026', radiusNasIp: '', authMode: '' })
      setEditingMt(null)
      setShowAddMtModal(false)
      fetchData(true)
      showToast(`Router berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}!`, 'success')
      if (!isEdit && newMtConfig.authMode === 'radius') openScriptModal(savedNas)
    } catch (err) { showToast(err.message, 'error') }
  }

  const prepareEditMt = (cfg) => {
    setEditingMt(cfg)
    setNewMtConfig({
      name: cfg.name || '',
      host: cfg.host || '',
      user: cfg.user || '',
      pass: '', // kosongkan — isi hanya kalau mau ganti
      port: cfg.port || 8728,
      radiusSecret: cfg.radius_secret || 'Mynet@2026',
      radiusNasIp: cfg.radius_nas_ip || '',
      authMode: cfg.auth_mode || ''
    })
    setShowAddMtModal(true)
  }

  const handleSyncRadius = () => {
    requestConfirm('Sinkronisasi Router', 'Apakah Anda ingin mengirim ulang data dari RADIUS ke MikroTik sekarang? Akses pelanggan yang sudah online tidak akan terganggu.', async () => {
      try {
        const res = await fetch('/api/radius/sync', { method: 'POST', headers: authHeader() })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        showToast(data.message, 'success')
      } catch (err) { showToast(err.message, 'error') }
    }, 'info')
  }

  const handleDeleteRouter = (id) => {
    requestConfirm('Putus Router', 'Apakah Anda yakin ingin menghapus kredensial router MikroTik ini dari RADIUS?', async () => {
      try {
        await fetch(`/api/mikrotik/config/${id}`, { method: 'DELETE', headers: authHeader() })
        fetchData(true)
        showToast('Router berhasil dihapus', 'success')
      } catch (err) { showToast(err.message, 'error') }
    }, 'danger')
  }

  return {
    mtConfigs, setMtConfigs,
    mtLoading, setMtLoading,
    mtProfiles, setMtProfiles,
    routerStatus, setRouterStatus,
    showAddMtModal, setShowAddMtModal,
    showMtScriptModal, setShowMtScriptModal,
    scriptNas, setScriptNas,
    scriptConfig, setScriptConfig,
    scriptGenerated, setScriptGenerated,
    serverIpLoading, setServerIpLoading,
    editingMt, setEditingMt,
    newMtConfig, setNewMtConfig,
    showRouterPass, setShowRouterPass,
    selectedRouterIds, setSelectedRouterIds,
    setMikrotikActiveTenant: (id) => { activeTenantRef.current = id },
    checkRouterStatusSilent,
    checkRouterStatus,
    openScriptModal,
    handleAddMtConfig,
    prepareEditMt,
    handleSyncRadius,
    handleDeleteRouter,
  }
}
