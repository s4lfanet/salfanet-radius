import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { compressImage, composeAddress } from '../utils/appUtils'

export function useUsers({
  authHeader,
  showToast,
  requestConfirm,
  requestCritical,
  setIsSilentRefetching,
  fetchAbortRef,
  setActivePromises,
  fetchData,
  navigateTo,
  currentUser,
  selectedWlEntry,
  setSelectedWlEntry,
  territories = [],
  mtConfigs = [],
}) {
  // ─── Stats & Realtime ───────────────────────────────────────────────────────
  const [stats, setStats] = useState({ total_users: 0, online_users: 0, total_groups: 0 })
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [logs, setLogs] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [offlineSessions, setOfflineSessions] = useState([])

  // ─── Profiles & Settings ────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState([])
  const [billingSettings, setBillingSettings] = useState({
    wa_api_url: '',
    wa_api_key: '',
    default_due_date: '5',
    isolate_hour: '1',
    company_name: 'PMY NET ISP',
    auto_isolate_enabled: '1'
  })
  const [applyToAll, setApplyToAll] = useState(false)
  const [applyToAllLoading, setApplyToAllLoading] = useState(false)
  const [settingsForm, setSettingsForm] = useState({})
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // ─── User Form ──────────────────────────────────────────────────────────────
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [psbSubmitting, setPsbSubmitting] = useState(false)
  const [formWarnings, setFormWarnings] = useState({ phone: '', nik: '' })
  const [newUser, setNewUser] = useState({
    username: '', password: '', groupname: '', staticIp: '', fullname: '', phone: '',
    address: '', identity_number: '', due_date_day: '5', auto_suspend: 1,
    nas_id: '', pop: '', odp: '', territory_id: '', latitude: null, longitude: null,
    install_date: new Date().toISOString().split('T')[0], connection_type: 'pppoe',
    billing_type: 'prepaid'
  })
  const [psbAddons, setPsbAddons] = useState([]) // [{ addon_type_id, price_override }]
  const [wilayahData, setWilayahData] = useState({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
  const [selWilayah, setSelWilayah] = useState({ prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' })
  const [editingUser, setEditingUser] = useState(null)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [editDusunSearch, setEditDusunSearch] = useState(null)
  const [ktpPhoto, setKtpPhoto] = useState(null)
  const [ktpPhotoView, setKtpPhotoView] = useState(null)
  const [packageChangeWarning, setPackageChangeWarning] = useState(null)
  const [packageChangeReason, setPackageChangeReason] = useState('')
  const [showEditPassword, setShowEditPassword] = useState(false)

  // PSB wilayah picker
  const [psbDusunOptions, setPsbDusunOptions] = useState([])
  const [psbDusunPicker, setPsbDusunPicker] = useState(false)
  const [psbSelectedAreaId, setPsbSelectedAreaId] = useState(null)

  // ─── Group Form ─────────────────────────────────────────────────────────────
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [newGroup, setNewGroup] = useState({ groupname: '', uploadLimit: '', downloadLimit: '', ipPool: '', sessionTimeout: '', mikrotikProfile: '', rateLimit: '' })
  const [editingGroup, setEditingGroup] = useState(null) // was undeclared bug in App.jsx

  // ─── Profile Form ───────────────────────────────────────────────────────────
  const [showAddProfileModal, setShowAddProfileModal] = useState(false)
  const [newProfile, setNewProfile] = useState({ name: '', upload: '', download: '', price: '', description: '', ipPool: '', mikrotik_profile: '' })
  const [editingProfile, setEditingProfile] = useState(null)
  const [profileSyncResults, setProfileSyncResults] = useState(null)
  const [profilePage, setProfilePage] = useState(1)
  const [profileSearch, setProfileSearch] = useState('')
  const [profileSort, setProfileSort] = useState({ col: null, dir: 'asc' })
  const [profileSaving, setProfileSaving] = useState(false)

  // ─── Pelanggan Table ────────────────────────────────────────────────────────
  const [pelangganSort, setPelangganSort] = useState({ col: null, dir: 'asc' })
  const [pelangganSubTab, setPelangganSubTab] = useState('all')
  const [userFilters, setUserFilters] = useState({ status: 'all', profile: 'all', search: '', nas: 'all', pop: 'all', odp: 'all', wilayah: 'all', connectionType: 'all' })
  const [userPagination, setUserPagination] = useState(() => {
    try {
      const saved = localStorage.getItem('userPagination')
      if (saved) {
        const parsed = JSON.parse(saved)
        return { currentPage: parsed.currentPage || 1, entriesPerPage: parsed.entriesPerPage || 10 }
      }
    } catch {}
    return { currentPage: 1, entriesPerPage: 10 }
  })
  const [staffSearch, setStaffSearch] = useState('')
  const [staffPage, setStaffPage] = useState(1)
  const [openActionMenu, setOpenActionMenu] = useState(null)
  const [actionMenuOpenUp, setActionMenuOpenUp] = useState(false)
  const [actionMenuPos, setActionMenuPos] = useState({ top: 0, right: 0 })
  const [selectedUsers, setSelectedUsers] = useState([])

  // ─── Import ─────────────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState([])
  const [importing, setImporting] = useState(false)

  // ─── User Detail Modal ──────────────────────────────────────────────────────
  const [showUserDetailModal, setShowUserDetailModal] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [customerDetailData, setCustomerDetailData] = useState({ info: null, history: [] })
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showDetailPassword, setShowDetailPassword] = useState(false)
  const [showUserStatsModal, setShowUserStatsModal] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(3)

  // ─── Customer Addons ────────────────────────────────────────────────────────
  const [customerAddons, setCustomerAddons] = useState([])
  const [addonsLoading, setAddonsLoading] = useState(false)

  const loadCustomerAddons = async (username) => {
    if (!username) return
    setAddonsLoading(true)
    try {
      const res = await fetch(`/api/customers/${username}/addons`, { headers: authHeader() })
      if (res.ok) setCustomerAddons(await res.json())
    } catch (_) {}
    finally { setAddonsLoading(false) }
  }

  // ─── PIN ────────────────────────────────────────────────────────────────────
  const [showSetPinModal, setShowSetPinModal] = useState(false)
  const [pinTargetUser, setPinTargetUser] = useState(null)
  const [pinValue, setPinValue] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // ─── Duplicate NIK ──────────────────────────────────────────────────────────
  const [showDuplicateNikModal, setShowDuplicateNikModal] = useState(false)
  const [duplicateNiks, setDuplicateNiks] = useState([])
  const [duplicateNikLoading, setDuplicateNikLoading] = useState(false)

  // ─── Internal useEffects ────────────────────────────────────────────────────
  useEffect(() => {
    setUserPagination(prev => ({ ...prev, currentPage: 1 }))
  }, [userFilters])

  useEffect(() => {
    if (!openActionMenu) return
    const handler = () => setOpenActionMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openActionMenu])

  useEffect(() => {
    localStorage.setItem('userPagination', JSON.stringify(userPagination))
  }, [userPagination])

  useEffect(() => {
    if (showAddUserModal) {
      setWizardStep(1)
      setFormWarnings({ phone: '', nik: '' })
      setNewUser({ username: '', password: '', groupname: '', staticIp: '', fullname: '', phone: '', address: '', identity_number: '', due_date_day: '5', auto_suspend: 1, nas_id: '', pop: '', odp: '', territory_id: '', territory_area_id: '', reseller: '', latitude: null, longitude: null, install_date: new Date().toISOString().split('T')[0], connection_type: 'pppoe' })
      setPsbAddons([])
      setEditingUser(null)
      setSelWilayah({ prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' })
      fetchWilayah('provinsi').then(data => setWilayahData(d => ({ ...d, provinsi: data, kabupaten: [], kecamatan: [], kelurahan: [] })))
    }
  }, [showAddUserModal])

  useEffect(() => {
    if (showUserDetailModal && viewingUser) {
      setDetailTab('info')
      setShowDetailPassword(false)
      setHistoryLimit(3)
      fetchCustomerDetail(viewingUser.username)
    }
  }, [showUserDetailModal, viewingUser])

  // ─── Wilayah Helpers ────────────────────────────────────────────────────────
  const fetchWilayah = async (level, kode) => {
    try {
      const res = await fetch(`/api/wilayah/${level}${kode ? '/' + kode : ''}`, { headers: authHeader() })
      return res.ok ? await res.json() : []
    } catch { return [] }
  }

  const handleSelWilayah = async (level, kode, nama) => {
    if (level === 'prov') {
      const kab = await fetchWilayah('kabupaten', kode)
      setWilayahData(d => ({ ...d, kabupaten: kab, kecamatan: [], kelurahan: [] }))
      setSelWilayah(s => ({ ...s, prov: kode, provNama: nama, kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '' }))
    } else if (level === 'kab') {
      const kec = await fetchWilayah('kecamatan', kode)
      setWilayahData(d => ({ ...d, kecamatan: kec, kelurahan: [] }))
      setSelWilayah(s => ({ ...s, kab: kode, kabNama: nama, kec: '', kecNama: '', kel: '', kelNama: '' }))
    } else if (level === 'kec') {
      const kel = await fetchWilayah('kelurahan', kode)
      setWilayahData(d => ({ ...d, kelurahan: kel }))
      setSelWilayah(s => ({ ...s, kec: kode, kecNama: nama, kel: '', kelNama: '' }))
    } else if (level === 'kel') {
      setSelWilayah(s => ({ ...s, kel: kode, kelNama: nama }))
      setPsbDusunPicker(false)
      setPsbDusunOptions([])
      setPsbSelectedAreaId(null)
      setNewUser(u => ({ ...u, territory_id: '' }))
      try {
        const res = await fetch(`/api/territories/by-kelurahan/${kode}`, { headers: authHeader() })
        if (res.ok) {
          const result = await res.json()
          if (result && result.single === true) {
            setPsbDusunOptions([result.territory])
            setPsbDusunPicker(true)
          } else if (result && result.single === false) {
            setPsbDusunOptions(result.options)
            setPsbDusunPicker(true)
          }
        }
      } catch {}
    }
  }

  // ─── Silent Refresh ─────────────────────────────────────────────────────────
  const silentRefreshUsers = async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort()
    const ctrl = new AbortController()
    fetchAbortRef.current = ctrl
    try {
      setIsSilentRefetching(true)
      const headers = authHeader()
      const [statsRes, usersRes, onlineRes] = await Promise.all([
        fetch('/api/stats', { headers, signal: ctrl.signal }).catch(() => null),
        fetch(`/api/users${''}`, { headers, signal: ctrl.signal }).catch(() => null),
        fetch('/api/stats/online-users', { headers, signal: ctrl.signal }).catch(() => null),
      ])
      if (ctrl.signal.aborted) return
      if (statsRes?.ok) setStats(await statsRes.json())
      if (onlineRes?.ok) setOnlineUsers(await onlineRes.json())
      if (usersRes?.ok) {
        const usersData = await usersRes.json()
        setUsers(usersData.users)
        // Load active promises — 1 request bulk, bukan per-user
        fetch('/api/users/promises/active', { headers })
          .then(r => r.ok ? r.json() : {})
          .then(map => { if (!ctrl.signal.aborted) setActivePromises(map) })
          .catch(() => {})
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error('silentRefreshUsers error:', e)
    } finally {
      setIsSilentRefetching(false)
    }
  }

  // ─── Customer Detail ────────────────────────────────────────────────────────
  const fetchCustomerDetail = async (username) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/detail`, { headers: authHeader() })
      if (res.ok) {
        setCustomerDetailData(await res.json())
      }
    } catch (err) { console.error('Detail fetch error', err) }
    finally { setLoadingDetail(false) }
  }

  const fetchDuplicateNiks = async () => {
    setDuplicateNikLoading(true)
    try {
      const res = await fetch('/api/admin/duplicate-niks', { headers: authHeader() })
      const data = await res.json()
      setDuplicateNiks(data.duplicates || [])
      setShowDuplicateNikModal(true)
    } catch (err) {
      showToast('Gagal memuat data NIK duplikat', 'error')
    } finally {
      setDuplicateNikLoading(false)
    }
  }

  // ─── Profile CRUD ───────────────────────────────────────────────────────────
  const doSaveProfile = async () => {
    const isEdit = !!editingProfile
    const url = isEdit ? `/api/profiles/${editingProfile.id}` : '/api/profiles'

    setProfileSaving(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const rate_limit = `${newProfile.upload}M/${newProfile.download}M`
      // routerOverrides: object {nasId: profileName} → convert ke array [{nas_id, mikrotik_profile}]
      const routerOverridesArr = Object.entries(newProfile.routerOverrides || {})
        .filter(([, v]) => v && v.trim())
        .map(([nas_id, mikrotik_profile]) => ({ nas_id: parseInt(nas_id), mikrotik_profile: mikrotik_profile.trim() }))
      // Router yang punya override = otomatis disync; tanpa override = tidak disync (diasumsikan sudah ada profil)
      const routerIds = routerOverridesArr.length > 0 ? routerOverridesArr.map(r => r.nas_id) : null
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ ...newProfile, rate_limit, routerIds, routerOverrides: routerOverridesArr }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { throw new Error('Server error: ' + text.slice(0, 100)) }
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan profil')

      fetchData(true)
      if (data.syncBackground) {
        setShowAddProfileModal(false)
        setProfileSyncResults(null)
        setNewProfile({ name: '', upload: '', download: '', price: '', description: '', ipPool: '', mikrotik_profile: '', routerOverrides: {} })
        setEditingProfile(null)
        showToast(isEdit ? 'Profil berhasil diupdate & sync ke router berjalan.' : 'Profil berhasil disimpan & sync ke router berjalan.', 'success')
      } else {
        setProfileSyncResults(data.syncResults || [])
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        showToast('Request timeout. Data mungkin tersimpan, silakan refresh.', 'error')
      } else {
        showToast(err.message || 'Terjadi kesalahan', 'error')
      }
    } finally {
      setProfileSaving(false)
    }
  }

  const handleCreateProfile = (e) => {
    e.preventDefault()

    // Cek router LOCAL yang belum diset profilnya → tampilkan konfirmasi
    const localRoutersWithoutOverride = mtConfigs.filter(c =>
      (c.auth_mode === 'local' || !c.auth_mode) &&
      !(newProfile.routerOverrides?.[c.id] || '').trim()
    )
    if (localRoutersWithoutOverride.length > 0) {
      const routerNames = localRoutersWithoutOverride.map(c => c.name || c.host).join(', ')
      requestConfirm(
        'Router Tanpa Override Profil',
        `Router LOCAL berikut belum diset profilnya: ${routerNames}.\n\nSistem akan menggunakan nama paket "${newProfile.name}" sebagai PPP Profile di MikroTik. Pastikan profil dengan nama tersebut sudah ada di router, atau set override terlebih dahulu.\n\nLanjutkan menyimpan?`,
        () => doSaveProfile(),
        'warning'
      )
      return
    }

    doSaveProfile()
  }

  // Buka modal edit paket + fetch router overrides yang sudah ada
  const handleEditProfile = async (p, mtConfigs) => {
    setEditingProfile(p)
    setNewProfile({
      name: p.name,
      upload: (p.rate_limit || '').split('/')[0]?.replace(/M$/i, '') || '',
      download: (p.rate_limit || '').split('/')[1]?.replace(/M$/i, '') || '',
      price: Math.round(parseFloat(p.price) || 0).toString(),
      description: p.description || '',
      ipPool: p.pool_name || '',
      mikrotik_profile: p.mikrotik_profile || '',
      routerOverrides: {}
    })
    setProfileSyncResults(null)
    setShowAddProfileModal(true)
    // Fetch existing router overrides di background
    try {
      const res = await fetch(`/api/profiles/${p.id}/router-map`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (res.ok) {
        const rows = await res.json()
        const overridesObj = {}
        rows.forEach(r => { overridesObj[String(r.nas_id)] = r.mikrotik_profile })
        setNewProfile(prev => ({ ...prev, routerOverrides: overridesObj }))
      }
    } catch (_) {}
  }

  const handleDeleteProfile = (id, name) => {
    requestConfirm('Hapus Profil', `Apakah Anda yakin ingin menghapus profil ${name}? Aturan di RADIUS juga akan dihapus.`, async () => {
      try {
        const res = await fetch(`/api/profiles/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        if (!res.ok) throw new Error((await res.json()).error)
        fetchData(true)
        showToast('Profil berhasil dihapus', 'success')
      } catch (err) { showToast(err.message, 'error') }
    }, 'danger')
  }

  // ─── Settings ───────────────────────────────────────────────────────────────
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/billing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(settingsForm)
      })
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan')
      setBillingSettings(settingsForm)

      if (applyToAll) {
        setApplyToAllLoading(true)
        const messages = []
        const errors = []
        try {
          // 1. Bulk update auto_suspend per pelanggan
          const rAs = await fetch('/api/billing/apply-auto-suspend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ auto_suspend: settingsForm.auto_isolate_enabled === '1' })
          })
          const dAs = await rAs.json()
          if (rAs.ok) messages.push(dAs.message)
          else errors.push(dAs.error)
        } catch (e) { errors.push(e.message) }
        try {
          // 2. Bulk update due_date_day per pelanggan (hanya jika due_date valid)
          const dueDay = parseInt(settingsForm.default_due_date, 10)
          if (dueDay >= 1 && dueDay <= 31) {
            const rDd = await fetch('/api/billing/apply-due-date', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeader() },
              body: JSON.stringify({ due_date_day: dueDay })
            })
            const dDd = await rDd.json()
            if (rDd.ok) messages.push(dDd.message)
            else errors.push(dDd.error)
          }
        } catch (e) { errors.push(e.message) }
        if (errors.length > 0) {
          showToast(`Pengaturan disimpan. Bulk update: ${errors.join(', ')}`, 'warning')
        } else {
          showToast(`Pengaturan & semua pelanggan berhasil diperbarui.`, 'success')
        }
        setApplyToAllLoading(false)
        setApplyToAll(false)
      } else {
        showToast('Pengaturan berhasil disimpan', 'success')
      }
    } catch (err) { showToast(err.message, 'error') }
  }

  // ─── PSB Validation ─────────────────────────────────────────────────────────
  const validateStep1 = () => {
    const isTechnician = currentUser?.role === 'technician'
    const warnings = { phone: '', nik: '' }
    let hasError = false

    if (isTechnician) {
      if (!newUser.fullname.trim()) { showToast('Nama lengkap pelanggan wajib diisi', 'error'); hasError = true }
      if (!newUser.phone.trim()) { showToast('No HP / WhatsApp wajib diisi', 'error'); hasError = true }
      if (!newUser.identity_number.trim()) { showToast('No Identitas (NIK) wajib diisi', 'error'); hasError = true }
      if (!selWilayah.prov) { showToast('Provinsi wajib dipilih', 'error'); hasError = true }
      const hasAreas = territories.flatMap(t => t.areas || []).length > 0
      if (hasAreas && !newUser.territory_area_id) { showToast('Wilayah / kolektor wajib dipilih', 'error'); hasError = true }
      if (!newUser.latitude || !newUser.longitude) { showToast('Koordinat lokasi pelanggan wajib diisi — klik pada peta atau pakai GPS', 'error'); hasError = true }
    }

    if (!ktpPhoto) { showToast('Foto KTP wajib diupload', 'error'); hasError = true }

    if (newUser.identity_number.trim()) {
      if (!/^\d{16}$/.test(newUser.identity_number.trim())) {
        warnings.nik = 'NIK harus tepat 16 digit angka'
        hasError = true
      } else {
        const nikLower = newUser.identity_number.trim()
        const conflict = users.find(u => u.identity_number === nikLower && u.username !== (editingUser?.username || ''))
        if (conflict) {
          warnings.nik = `⚠️ NIK sudah terdaftar atas nama: ${conflict.fullname || conflict.username}`
        }
      }
    }

    if (newUser.phone.trim()) {
      const phoneConflict = users.find(u => u.phone === newUser.phone.trim() && u.username !== (editingUser?.username || ''))
      if (phoneConflict) {
        warnings.phone = `⚠️ No HP sudah terdaftar atas nama: ${phoneConflict.fullname || phoneConflict.username}`
      }
    }

    setFormWarnings(warnings)
    if (hasError) return false
    return true
  }

  // ─── User CRUD ──────────────────────────────────────────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (psbSubmitting) return
    setPsbSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ ...newUser, address: composeAddress(selWilayah) || newUser.address, ktp_photo: ktpPhoto || null, psb_addons: psbAddons.length > 0 ? psbAddons : undefined })
      })
      if (!res.ok) throw new Error((await res.json()).error)

      if (selectedWlEntry) {
        try {
          await fetch(`/api/waiting-list/${selectedWlEntry.id}/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ pppoe_username: newUser.username })
          })
        } catch (_) {}
        setSelectedWlEntry(null)
      }

      setNewUser({ username: '', password: '', groupname: '', staticIp: '', macAddress: '', fullname: '', phone: '', address: '', identity_number: '', due_date_day: '5', auto_suspend: 1, nas_id: '', pop: '', odp: '', reseller: '', latitude: null, longitude: null, install_date: new Date().toISOString().split('T')[0], connection_type: 'pppoe', discount: 0, discount_note: '' })
      setSelWilayah({ prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' })
      setKtpPhoto(null)
      setPsbAddons([])
      setWizardStep(1)
      setFormWarnings({ phone: '', nik: '' })
      setShowAddUserModal(false)
      if (currentUser?.role === 'technician') navigateTo('dashboard')
      fetchData(true)
      showToast('Pelanggan berhasil ditambahkan', 'success')
    } catch (err) { showToast(err.message, 'error') }
    finally { setPsbSubmitting(false) }
  }

  const prepareEditUser = (user) => {
    setEditingUser(user)
    setShowEditPassword(false)
    setNewUser({
      username: user.username,
      password: '',
      groupname: user.groupname || '',
      staticIp: user.static_ip || '',
      fullname: user.fullname || '',
      phone: user.phone || '',
      address: user.address || '',
      identity_number: user.identity_number || '',
      due_date_day: user.due_date_day || '5',
      auto_suspend: user.auto_suspend,
      nas_id: user.nas_id || '',
      pop: user.pop || '',
      odp: user.odp || '',
      territory_id: user.territory_id || '',
      territory_area_id: user.territory_area_id || '',
      latitude: user.latitude ? parseFloat(user.latitude) : null,
      longitude: user.longitude ? parseFloat(user.longitude) : null,
      reseller: user.reseller || '',
      install_date: user.install_date ? user.install_date.slice(0, 10) : (user.created_at ? user.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      discount: user.discount || 0,
      discount_note: user.discount_note || '',
      billing_type: user.billing_type || 'prepaid'
    })
    setEditDusunSearch(null)
    setShowEditUserModal(true)
  }

  const handleUpdateUser = async (e, confirmOverride = false, changeReason = '') => {
    if (e && e.preventDefault) e.preventDefault()
    try {
      const body = { ...newUser, ktp_photo: ktpPhoto !== null ? ktpPhoto : undefined }
      if (confirmOverride) {
        body.confirm_package_change = true
        body.change_reason = changeReason
      }
      const res = await fetch(`/api/users/${encodeURIComponent(editingUser.username)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      if (res.status === 409 && data.warning) {
        setPackageChangeWarning(data)
        setPackageChangeReason('')
        return
      }

      if (!res.ok) throw new Error(data.error)

      setShowEditUserModal(false)
      setEditingUser(null)
      setKtpPhoto(null)
      setPackageChangeWarning(null)
      setPackageChangeReason('')
      setNewUser({ username: '', password: '', groupname: '', staticIp: '', fullname: '', phone: '', address: '', identity_number: '', due_date_day: '5', auto_suspend: 1, nas_id: '', pop: '', odp: '', reseller: '', latitude: null, longitude: null, connection_type: 'pppoe', discount: 0, discount_note: '' })
      fetchData(true)

      if (data.kicked) {
        showToast('Paket diperbarui & Sesi ditendang otomatis!', 'success')
      } else {
        showToast('Data pelanggan berhasil diperbarui', 'success')
      }
    } catch (err) { showToast(err.message, 'error') }
  }

  const openSetPin = (user) => { setPinTargetUser(user); setPinValue(''); setShowSetPinModal(true) }

  const handleSetPin = async () => {
    if (!pinTargetUser) return
    if (!/^\d{6}$/.test(pinValue)) return showToast('PIN harus 6 digit angka', 'error')
    setPinLoading(true)
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(pinTargetUser.username)}/set-pin`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue })
      })
      const data = await r.json()
      if (!r.ok) return showToast(data.error || 'Gagal mengatur PIN', 'error')
      showToast(`PIN untuk ${pinTargetUser.username} berhasil diatur`, 'success')
      setShowSetPinModal(false)
    } catch (err) { showToast(err.message, 'error') }
    finally { setPinLoading(false) }
  }

  const handleSuspendUser = (username) => {
    requestConfirm('Isolir Pelanggan', `Apakah Anda yakin ingin mengisolir pengguna ${username}? Akses internet mereka akan terputus.`, async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/suspend`, { method: 'POST', headers: authHeader() })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Gagal mengisolir pelanggan')
        setUsers(prev => prev.map(u => u.username === username ? { ...u, is_suspended: true } : u))
        showToast(`User ${username} berhasil diisolir`, 'warning')
        silentRefreshUsers()
      } catch (err) { showToast(err.message, 'error') }
    }, 'warning')
  }

  const handleDeleteUser = (username) => {
    requestCritical(
      'Hapus Pelanggan',
      `Kamu akan menghapus pelanggan ${username} secara permanen. Semua data RADIUS dan tagihan akan ikut terhapus. Tindakan ini tidak bisa diurungkan.`,
      async (admin_password) => {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
          method: 'DELETE',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password })
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        setUsers(prev => prev.filter(u => u.username !== username))
        showToast(`Pelanggan ${username} berhasil dihapus`, 'success')
        silentRefreshUsers()
      }
    )
  }

  const handleStopUser = (username, fullname) => {
    requestConfirm(
      'Set Pelanggan Berhenti',
      `Pelanggan ${fullname || username} akan dihentikan — koneksi diputus dan tidak dihitung di statistik. Lanjutkan?`,
      async () => {
        try {
          const res = await fetch(`/api/users/${encodeURIComponent(username)}/stop`, { method: 'POST', headers: authHeader() })
          if (!res.ok) throw new Error((await res.json()).error)
          showToast(`${username} telah dihentikan`, 'warning')
          silentRefreshUsers()
        } catch (err) { showToast(err.message, 'error') }
      }, 'warning'
    )
  }

  const handleReactivateUser = async (username) => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/reactivate`, { method: 'POST', headers: authHeader() })
      if (!res.ok) throw new Error((await res.json()).error)
      showToast(`${username} berhasil diaktifkan kembali`, 'success')
      silentRefreshUsers()
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleActivateUser = (username) => {
    requestConfirm('Buka Isolir', `Apakah Anda yakin ingin membuka isolir untuk pelanggan ${username}?`, async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/activate`, { method: 'POST', headers: authHeader() })
        if (!res.ok) throw new Error('Gagal mengaktifkan user')
        setUsers(prev => prev.map(u => u.username === username ? { ...u, is_isolated: false } : u))
        showToast('Akses pelanggan berhasil diaktifkan kembali', 'success')
        silentRefreshUsers()
      } catch (err) { showToast(err.message, 'error') }
    }, 'info')
  }

  const handleSyncSecret = async (username) => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/sync-secret`, { method: 'POST', headers: authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal sinkron secret')
      showToast(data.message || 'PPP Secret berhasil disinkronkan', data.success ? 'success' : 'error')
    } catch (err) { showToast(err.message, 'error') }
  }

  // ─── Group CRUD ─────────────────────────────────────────────────────────────
  const handleCreateGroup = async (e) => {
    e.preventDefault()
    const isEdit = !!editingGroup
    const url = isEdit ? `/api/groups/${editingGroup.groupname}` : '/api/groups'
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(newGroup)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewGroup({ groupname: '', uploadLimit: '', downloadLimit: '', ipPool: '', sessionTimeout: '', mikrotikProfile: '', rateLimit: '' })
      setEditingGroup(null)
      setShowAddGroupModal(false)
      fetchData(true)
      showToast(isEdit ? 'Paket berhasil diperbarui' : 'Paket berhasil dibuat', 'success')
    } catch (err) { showToast(err.message, 'error') }
  }

  const prepareEditGroup = (g) => {
    let upload = '', download = ''
    if (g.rate_limit && g.rate_limit.includes('/')) {
      [upload, download] = g.rate_limit.split('/')
    }
    setEditingGroup(g)
    setNewGroup({
      groupname: g.groupname,
      uploadLimit: upload,
      downloadLimit: download,
      ipPool: g.ip_pool || '',
      sessionTimeout: g.session_timeout || '',
      mikrotikProfile: g.mikrotik_profile || '',
      rateLimit: g.rate_limit || ''
    })
    setShowAddGroupModal(true)
  }

  const handleDeleteGroup = (groupname) => {
    requestConfirm('Hapus Paket Internet', `Apakah Anda yakin ingin menghapus paket ${groupname}?`, async () => {
      try {
        const res = await fetch(`/api/groups/${groupname}`, { method: 'DELETE', headers: authHeader() })
        if (!res.ok) throw new Error((await res.json()).error)
        fetchData(true)
        showToast('Paket berhasil dihapus', 'success')
      } catch (err) { showToast(err.message, 'error') }
    }, 'danger')
  }

  // ─── WhatsApp ────────────────────────────────────────────────────────────────
  const normalizePhone = (phone) => {
    if (!phone) return ''
    phone = phone.replace(/\D/g, '')
    if (phone.startsWith('0')) phone = '62' + phone.slice(1)
    return phone
  }

  const handleSendMessage = (user) => {
    if (!user.phone) {
      showToast('Nomor WhatsApp tidak terdeteksi untuk pelanggan ini.', 'warning')
      return
    }
    const packagePrice = Number(profiles.find(p => p.name === user.groupname)?.price || 0)
    const addonAmt = parseFloat(user.addon_amount || 0)
    const totalTagihan = packagePrice + addonAmt
    const dueDay = user.due_date_day || billingSettings.default_due_date

    let rincian = `• Internet *${user.groupname || '-'}*: Rp ${packagePrice.toLocaleString('id-ID')}`
    if (addonAmt > 0) {
      rincian += `\n• Layanan tambahan: Rp ${addonAmt.toLocaleString('id-ID')}`
    }

    const message = `Halo Bapak/Ibu ${user.fullname || user.username},\n\nKami dari *${billingSettings.company_name}* ingin menginformasikan tagihan internet Anda:\n\n${rincian}\n*Total: Rp ${totalTagihan.toLocaleString('id-ID')}*\n\nJatuh tempo pada tanggal *${dueDay}*. Mohon segera melakukan pembayaran agar akses internet tetap lancar. Terima kasih. 🙏`
    const url = `https://wa.me/${normalizePhone(user.phone)}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  // ─── KTP Photo ──────────────────────────────────────────────────────────────
  const handleKtpSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar (JPG/PNG)', 'error'); return }
    try {
      showToast('Mengompres foto KTP...', 'info')
      const compressed = await compressImage(file)
      setKtpPhoto(compressed)
      showToast(`Foto KTP siap (${Math.round(compressed.length * 0.75 / 1024)} KB)`, 'success')
    } catch { showToast('Gagal memproses foto', 'error') }
  }

  // ─── Import ─────────────────────────────────────────────────────────────────
  const detectDelimiter = (headerLine) => {
    const commas = (headerLine.match(/,/g) || []).length
    const semicolons = (headerLine.match(/;/g) || []).length
    const tabs = (headerLine.match(/\t/g) || []).length
    if (tabs > commas && tabs > semicolons) return '\t'
    if (semicolons > commas) return ';'
    return ','
  }

  const parseCSVRow = (row, delim = ',') => {
    const result = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === delim && !inQuotes) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const parseCSVText = (rawText, normalizeHeaders = false) => {
    const text = rawText.replace(/^﻿/, '')
    const rows = text.split(/\r?\n/).filter(r => r.trim())
    if (rows.length < 2) return []
    const delim = detectDelimiter(rows[0])
    const headers = parseCSVRow(rows[0], delim).map(h =>
      normalizeHeaders ? h.toLowerCase().replace(/\s+/g, '_') : h.toLowerCase()
    )
    return rows.slice(1).map(row => {
      const values = parseCSVRow(row, delim)
      if (values.length < 2) return null
      const obj = {}
      headers.forEach((header, idx) => {
        if (values[idx] !== undefined && values[idx] !== '') obj[header] = values[idx]
      })
      return obj
    }).filter(Boolean)
  }

  const downloadImportTemplate = async () => {
    // Fetch data referensi dari sistem (paket, router, dusun)
    const [profilesRes, nasRes, territoriesRes] = await Promise.all([
      fetch('/api/profiles', { headers: authHeader() }).then(r => r.ok ? r.json() : []),
      fetch('/api/mikrotik/routers', { headers: authHeader() }).then(r => r.ok ? r.json() : []),
      fetch('/api/territories', { headers: authHeader() }).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    // Flatten semua dusun dari semua territories
    const areasRes = territoriesRes.flatMap(t => (t.areas || []).map(a => ({ ...a, territory_name: t.name })))

    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Template ───────────────────────────────────────────────
    const headers = [
      'username*', 'password', 'connection_type', 'fullname', 'phone', 'identity_number',
      'groupname', 'billing_type', 'due_date_day', 'nas_id', 'pop', 'odp',
      'address', 'dusun', 'static_ip', 'mac_address', 'install_date', 'tikor'
    ]
    const example = [
      'budi.santoso', 'budi123', 'pppoe', 'Budi Santoso', '6281234567890', '3201010101010001',
      profilesRes[0]?.name || '30Mbps', 'prepaid', '5',
      nasRes[0]?.name || nasRes[0]?.host || '',
      'POP Utama', 'ODP-01-GDG',
      'Jl. Merdeka No.1 RT 001', areasRes[0]?.dusun_nama || 'Cibogo', '', '', '2026-03-15', '-6.912345,107.654321'
    ]
    const exampleStatic = [
      'pelanggan.static', '', 'static', 'Pelanggan Static', '6285678901234', '',
      profilesRes[0]?.name || '30Mbps', 'prepaid', '5',
      nasRes[0]?.name || nasRes[0]?.host || '',
      '', 'ODP-02-GDG',
      'Jl. Contoh No.2', areasRes[0]?.dusun_nama || 'Cibogo', '192.168.60.100', 'AA:BB:CC:DD:EE:FF', '2026-03-15', ''
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, example, exampleStatic])
    ws['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 20 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
      { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 24 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Template')

    // ── Sheet 2: Petunjuk Kolom ─────────────────────────────────────────
    const instrData = [
      ['PANDUAN IMPORT PELANGGAN'],
      [''],
      ['Kolom', 'Keterangan', 'Status', 'Contoh Nilai'],
      ['username*', 'Username unik, tanpa spasi. Untuk PPPoE = username login; untuk Static = ID identifikasi pelanggan', 'WAJIB', 'budi.santoso'],
      ['password', 'Password PPPoE. WAJIB untuk tipe pppoe. Kosongkan untuk tipe static', 'Wajib (PPPoE)', 'budi123'],
      ['connection_type', 'Tipe koneksi: "pppoe" atau "static". Kosong = pppoe', 'Disarankan', 'pppoe'],
      ['fullname', 'Nama lengkap pelanggan', 'Disarankan', 'Budi Santoso'],
      ['phone', 'Nomor HP diawali 62 (tanpa + atau 0 di depan)', 'Opsional', '6281234567890'],
      ['identity_number', 'NIK KTP 16 digit', 'Opsional', '3201010101010001'],
      ['groupname', 'Nama paket internet — lihat sheet "Referensi" kolom Paket', 'Disarankan', profilesRes[0]?.name || '30Mbps'],
      ['billing_type', 'Tipe tagihan: prepaid (prabayar) atau postpaid (pascabayar). Kosong = prepaid', 'Disarankan', 'prepaid'],
      ['due_date_day', 'Tanggal jatuh tempo (angka 1–31). Kosong = pakai default sistem', 'Opsional', '5'],
      ['nas_id', 'Nama atau IP router — lihat sheet "Referensi" kolom Router', 'Opsional', nasRes[0]?.name || nasRes[0]?.host || ''],
      ['pop', 'Nama POP / titik distribusi jaringan', 'Opsional', 'POP Utama'],
      ['odp', 'Nama ODP / kotak distribusi optik', 'Opsional', 'ODP-01-GDG'],
      ['address', 'Alamat lengkap pelanggan', 'Opsional', 'Jl. Merdeka No.1 RT 001'],
      ['dusun', 'Nama dusun — lihat sheet "Referensi" kolom Dusun (untuk assign kolektor otomatis)', 'Opsional', areasRes[0]?.dusun_nama || 'Cibogo'],
      ['static_ip', 'WAJIB untuk tipe static (IP yang di-assign ke pelanggan). Untuk PPPoE: isi jika pakai Framed-IP', 'Wajib (Static)', '192.168.60.100'],
      ['mac_address', 'MAC address perangkat pelanggan. Untuk static: digunakan buat ARP binding di MikroTik', 'Opsional', 'AA:BB:CC:DD:EE:FF'],
      ['install_date', 'Tanggal pasang format YYYY-MM-DD. Kosong = hari ini. Isi bulan lalu = migrasi (invoice unpaid)', 'Opsional', '2026-03-15'],
      ['tikor', 'Titik koordinat lokasi pelanggan. Format: latitude,longitude (dipisah koma, tanpa spasi wajib)', 'Opsional', '-6.912345,107.654321'],
      [''],
      ['CATATAN PENTING:'],
      ['• PPPoE: username + password WAJIB diisi'],
      ['• Static IP: username + static_ip WAJIB, password DIKOSONGKAN, connection_type diisi "static"'],
      ['• Baris yang tidak memenuhi syarat di atas akan otomatis dilewati'],
      ['• Jika username sudah ada di sistem, data akan diperbarui (bukan duplikat)'],
      ['• groupname harus sama persis dengan nama paket di sistem (lihat sheet Referensi)'],
      ['• nas_id boleh diisi nama router atau IP-nya langsung (tidak perlu tahu angka ID-nya)'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
    wsInstr['!cols'] = [{ wch: 18 }, { wch: 65 }, { wch: 12 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Petunjuk')

    // ── Sheet 3: Referensi (data nyata dari sistem) ─────────────────────
    const refData = [['REFERENSI DATA SISTEM — Salin nilai persis seperti tertulis di bawah'], ['']]

    refData.push(['PAKET INTERNET (isi di kolom groupname):'])
    refData.push(['Nama Paket', 'Kecepatan', 'Harga/Bulan'])
    if (profilesRes.length > 0) {
      profilesRes.forEach(p => refData.push([p.name, p.rate_limit || '—', p.price ? `Rp ${Number(p.price).toLocaleString('id-ID')}` : '—']))
    } else {
      refData.push(['(Belum ada paket terdaftar)', '', ''])
    }

    refData.push([''])
    refData.push(['ROUTER / NAS (isi di kolom nas_id — boleh pakai Nama atau IP):'])
    refData.push(['Nama Router', 'IP / Host', 'Keterangan'])
    if (nasRes.length > 0) {
      nasRes.forEach(n => refData.push([n.name || '—', n.host || '—', n.description || '']))
    } else {
      refData.push(['(Belum ada router terdaftar)', '', ''])
    }

    refData.push([''])
    refData.push(['DUSUN (isi di kolom dusun — salin persis):'])
    refData.push(['Nama Dusun', 'Kelurahan', 'Territory / Kolektor'])
    if (areasRes.length > 0) {
      areasRes.forEach(a => refData.push([a.dusun_nama || '—', a.kelurahan_nama || a.kelurahan_kode || '—', a.territory_name || '—']))
    } else {
      refData.push(['(Belum ada dusun terdaftar)', ''])
    }

    const wsRef = XLSX.utils.aoa_to_sheet(refData)
    wsRef['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, wsRef, 'Referensi')

    XLSX.writeFile(wb, 'template_import_pelanggan.xlsx')
  }

  const handleImportFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportFile(file)
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name)
    if (isXlsx) {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const wb = XLSX.read(new Uint8Array(event.target.result), { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
          const data = rows.map(row => {
            const obj = {}
            Object.keys(row).forEach(k => {
              // Strip * and normalize: "username*" → "username", "Nama Lengkap" → "nama_lengkap"
              const cleanKey = k.replace(/\*/g, '').toLowerCase().trim().replace(/\s+/g, '_')
              const val = String(row[k] || '').trim()
              if (val) obj[cleanKey] = val
            })
            return obj
          }).filter(r => r.username && (r.password || r.connection_type === 'static' || r.connection_type === 'hotspot' || (!r.connection_type && r.static_ip && !r.password)))
          setImportPreview(data)
        } catch (err) {
          showToast('Gagal membaca file Excel: ' + err.message, 'error')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (event) => {
        const data = parseCSVText(event.target.result)
        setImportPreview(data)
      }
      reader.readAsText(file, 'UTF-8')
    }
  }

  const executeBulkImport = async () => {
    if (!importFile || importPreview.length === 0) return
    setImporting(true)
    try {
      const usersToImport = importPreview
        .filter(u => u.username && (u.password || u.connection_type === 'static' || u.connection_type === 'hotspot' || (!u.connection_type && u.static_ip && !u.password)))
        .map(u => {
          // Parse kolom tikor "lat,long" → latitude + longitude terpisah
          if (u.tikor) {
            const parts = String(u.tikor).split(',')
            const lat = parseFloat(parts[0]?.trim())
            const lng = parseFloat(parts[1]?.trim())
            if (!isNaN(lat) && !isNaN(lng)) {
              return { ...u, latitude: lat, longitude: lng }
            }
          }
          return u
        })
      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ users: usersToImport })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      if (result.debugDusun?.length > 0) {
        console.log('[IMPORT DEBUG DUSUN]', result.debugDusun)
        const notFound = result.debugDusun.filter(d => d.includes('TIDAK DITEMUKAN') || d.includes('kosong'))
        const found = result.debugDusun.filter(d => d.includes('→ area_id'))
        if (found.length > 0 || notFound.length > 0) {
          showToast(`Dusun terassign: ${found.length}, tidak ditemukan: ${notFound.length}. Lihat Console (F12) untuk detail.`, notFound.length > 0 ? 'warning' : 'success')
        }
      }
      showToast(result.message, 'success')
      setShowImportModal(false)
      setImportFile(null)
      setImportPreview([])
      fetchData(true)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  // ─── Export Users ───────────────────────────────────────────────────────────
  const csvCell = (val) => {
    const s = String(val ?? '')
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const handleExportUsers = () => {
    const headers = ['username', 'password', 'connection_type', 'fullname', 'phone', 'identity_number', 'groupname', 'due_date_day', 'nas_id', 'pop', 'odp', 'address', 'territory_id', 'static_ip', 'install_date']
    const rows = users.map(u => ({
      username: u.username,
      password: u.connection_type === 'static' ? '' : (u.password || ''),
      connection_type: u.connection_type || 'pppoe',
      fullname: u.fullname || '',
      phone: u.phone || '',
      identity_number: u.identity_number || '',
      groupname: u.groupname || '',
      due_date_day: u.due_date_day || 5,
      nas_id: u.nas_id || '',
      pop: u.pop || '',
      odp: u.odp || '',
      address: u.address || '',
      territory_id: u.territory_id || '',
      static_ip: u.static_ip || '',
      install_date: u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : ''
    }))

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
    const colWidths = headers.map(h => {
      const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] || '').length))
      return { wch: Math.min(maxLen + 2, 50) }
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pelanggan')
    XLSX.writeFile(wb, `export_pelanggan_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`${users.length} pelanggan berhasil diekspor ke Excel`, 'success')
  }

  // ─── Bulk Actions ───────────────────────────────────────────────────────────
  const handleBulkSuspend = () => {
    if (selectedUsers.length === 0) return
    requestConfirm('Bulk Isolir', `Apakah Anda yakin ingin mengisolir ${selectedUsers.length} pelanggan terpilih?`, async () => {
      try {
        let success = 0, fail = 0
        for (const username of selectedUsers) {
          const res = await fetch(`/api/users/${encodeURIComponent(username)}/suspend`, { method: 'POST', headers: authHeader() })
          if (res.ok) success++
          else fail++
        }
        showToast(`Berhasil mengisolir ${success} user. ${fail > 0 ? fail + ' gagal.' : ''}`, success > 0 ? 'success' : 'error')
        setSelectedUsers([])
        silentRefreshUsers()
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  const handleBulkActivate = () => {
    if (selectedUsers.length === 0) return
    requestConfirm('Bulk Aktifkan', `Apakah Anda yakin ingin mengaktifkan kembali ${selectedUsers.length} pelanggan terpilih?`, async () => {
      try {
        let success = 0, fail = 0
        for (const username of selectedUsers) {
          const res = await fetch(`/api/users/${encodeURIComponent(username)}/activate`, { method: 'POST', headers: authHeader() })
          if (res.ok) success++
          else fail++
        }
        showToast(`Berhasil mengaktifkan ${success} user. ${fail > 0 ? fail + ' gagal.' : ''}`, success > 0 ? 'success' : 'error')
        setSelectedUsers([])
        silentRefreshUsers()
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  const handleBulkDelete = () => {
    if (selectedUsers.length === 0) return
    requestCritical(
      'Bulk Hapus Pelanggan',
      `⚠️ Kamu akan menghapus ${selectedUsers.length} pelanggan secara permanen. Tindakan ini tidak bisa diurungkan.`,
      async (admin_password) => {
        let success = 0, fail = 0
        for (const username of selectedUsers) {
          const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_password })
          })
          if (res.ok) { success++; setUsers(prev => prev.filter(u => u.username !== username)) }
          else fail++
        }
        showToast(`Berhasil menghapus ${success} user. ${fail > 0 ? fail + ' gagal.' : ''}`, success > 0 ? 'success' : 'error')
        setSelectedUsers([])
        silentRefreshUsers()
      }
    )
  }

  // ─── Formatting Helpers ─────────────────────────────────────────────────────
  const formatSpeed = (rate_limit) => {
    if (!rate_limit) return ''
    const parts = rate_limit.split('/')
    const up = (parts[0] || '').replace(/[Mm]$/, '').trim()
    const down = (parts[1] || '').replace(/[Mm]$/, '').trim()
    if (!down) return `${up} Mbps`
    return up === down ? `${down} Mbps` : `${up}↑/${down}↓ Mbps`
  }

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '0s'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h > 0 ? h + 'j ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`
  }

  return {
    // Stats & realtime
    stats, setStats,
    users, setUsers,
    groups, setGroups,
    logs, setLogs,
    onlineUsers, setOnlineUsers,
    offlineSessions, setOfflineSessions,
    // Profiles & settings
    profiles, setProfiles,
    billingSettings, setBillingSettings,
    applyToAll, setApplyToAll,
    applyToAllLoading, setApplyToAllLoading,
    settingsForm, setSettingsForm,
    showSettingsModal, setShowSettingsModal,
    // User form
    showAddUserModal, setShowAddUserModal,
    wizardStep, setWizardStep,
    psbAddons, setPsbAddons,
    psbSubmitting, setPsbSubmitting,
    formWarnings, setFormWarnings,
    newUser, setNewUser,
    wilayahData, setWilayahData,
    selWilayah, setSelWilayah,
    editingUser, setEditingUser,
    showEditUserModal, setShowEditUserModal,
    editDusunSearch, setEditDusunSearch,
    ktpPhoto, setKtpPhoto,
    ktpPhotoView, setKtpPhotoView,
    packageChangeWarning, setPackageChangeWarning,
    packageChangeReason, setPackageChangeReason,
    showEditPassword, setShowEditPassword,
    psbDusunOptions, setPsbDusunOptions,
    psbDusunPicker, setPsbDusunPicker,
    psbSelectedAreaId, setPsbSelectedAreaId,
    // Group form
    showAddGroupModal, setShowAddGroupModal,
    newGroup, setNewGroup,
    editingGroup, setEditingGroup,
    // Profile form
    showAddProfileModal, setShowAddProfileModal,
    newProfile, setNewProfile,
    editingProfile, setEditingProfile,
    profileSyncResults, setProfileSyncResults,
    profilePage, setProfilePage,
    profileSearch, setProfileSearch,
    profileSort, setProfileSort,
    profileSaving, setProfileSaving,
    // Pelanggan table
    pelangganSort, setPelangganSort,
    pelangganSubTab, setPelangganSubTab,
    userFilters, setUserFilters,
    userPagination, setUserPagination,
    staffSearch, setStaffSearch,
    staffPage, setStaffPage,
    openActionMenu, setOpenActionMenu,
    actionMenuOpenUp, setActionMenuOpenUp,
    actionMenuPos, setActionMenuPos,
    selectedUsers, setSelectedUsers,
    // Import
    showImportModal, setShowImportModal,
    importFile, setImportFile,
    importPreview, setImportPreview,
    importing, setImporting,
    // Detail modal
    showUserDetailModal, setShowUserDetailModal,
    viewingUser, setViewingUser,
    detailTab, setDetailTab,
    customerDetailData, setCustomerDetailData,
    loadingDetail, setLoadingDetail,
    showDetailPassword, setShowDetailPassword,
    showUserStatsModal, setShowUserStatsModal,
    historyLimit, setHistoryLimit,
    // Customer Addons
    customerAddons, setCustomerAddons,
    addonsLoading, setAddonsLoading,
    loadCustomerAddons,
    // PIN
    showSetPinModal, setShowSetPinModal,
    pinTargetUser, setPinTargetUser,
    pinValue, setPinValue,
    pinLoading, setPinLoading,
    // Duplicate NIK
    showDuplicateNikModal, setShowDuplicateNikModal,
    duplicateNiks, setDuplicateNiks,
    duplicateNikLoading, setDuplicateNikLoading,
    // Functions
    silentRefreshUsers,
    fetchCustomerDetail,
    fetchDuplicateNiks,
    handleCreateProfile,
    handleEditProfile,
    handleDeleteProfile,
    handleSaveSettings,
    validateStep1,
    handleCreateUser,
    prepareEditUser,
    handleUpdateUser,
    openSetPin,
    handleSetPin,
    handleSuspendUser,
    handleDeleteUser,
    handleStopUser,
    handleReactivateUser,
    handleActivateUser,
    handleSyncSecret,
    handleCreateGroup,
    prepareEditGroup,
    handleDeleteGroup,
    handleSendMessage,
    handleKtpSelect,
    downloadImportTemplate,
    handleImportFileChange,
    executeBulkImport,
    handleExportUsers,
    handleBulkSuspend,
    handleBulkActivate,
    handleBulkDelete,
    csvCell,
    fetchWilayah,
    handleSelWilayah,
    formatSpeed,
    formatBytes,
    formatDuration,
  }
}
