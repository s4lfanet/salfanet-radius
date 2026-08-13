import { useState } from 'react'

export function useTerritories({ authHeader, showToast, requestConfirm, fetchData }) {
  // fetchWilayah internal (sama dengan useWaitingList)
  const fetchWilayah = async (level, kode) => {
    try {
      const res = await fetch(`/api/wilayah/${level}${kode ? '/' + kode : ''}`, { headers: authHeader() })
      return res.ok ? await res.json() : []
    } catch { return [] }
  }

  // ── Territory state ──────────────────────────────────────────────────
  const [territories, setTerritories] = useState([])
  const [showAddTerritoryModal, setShowAddTerritoryModal] = useState(false)
  const [newTerritory, setNewTerritory] = useState({ name: '', description: '', collector_id: '' })
  const [editingTerritory, setEditingTerritory] = useState(null)
  const [managingAreasTerritoryId, setManagingAreasTerritoryId] = useState(null)

  // ── Area (kelurahan) state ───────────────────────────────────────────
  const [areaSearchWilayah, setAreaSearchWilayah] = useState({ prov: '', provNama: '', kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '' })
  const [areaWilayahData, setAreaWilayahData] = useState({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
  const [areaDusunInput, setAreaDusunInput] = useState('')
  const [areaDusunSuggestions, setAreaDusunSuggestions] = useState([])

  // ── Collector area (dusun assignment) state ─────────────────────────
  const [collectorAreas, setCollectorAreas] = useState([])
  const [assignDusunCollectorId, setAssignDusunCollectorId] = useState(null)
  const [assignDusunWilayah, setAssignDusunWilayah] = useState({ prov: '', provNama: '', kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '', kelKode: '' })
  const [assignDusunWilayahData, setAssignDusunWilayahData] = useState({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
  const [assignDusunName, setAssignDusunName] = useState('')
  const [assignDusunLoading, setAssignDusunLoading] = useState(false)
  const [showAssignDusunModal, setShowAssignDusunModal] = useState(false)

  // ── Territory CRUD ───────────────────────────────────────────────────
  const handleCreateTerritory = async (e) => {
    e.preventDefault()
    const isEdit = !!editingTerritory
    const url = isEdit ? `/api/territories/${editingTerritory.id}` : '/api/territories'
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(newTerritory)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewTerritory({ name: '', description: '', collector_id: '' })
      setEditingTerritory(null)
      setShowAddTerritoryModal(false)
      fetchData(true)
      showToast(isEdit ? 'Wilayah berhasil diperbarui' : 'Wilayah berhasil dibuat', 'success')
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleDeleteTerritory = (id, name) => {
    requestConfirm('Hapus Wilayah', `Apakah Anda yakin ingin menghapus wilayah ${name}?`, async () => {
      try {
        const res = await fetch(`/api/territories/${id}`, { method: 'DELETE', headers: authHeader() })
        if (!res.ok) throw new Error((await res.json()).error)
        fetchData(true)
        showToast('Wilayah berhasil dihapus', 'success')
      } catch (err) { showToast(err.message, 'error') }
    }, 'danger')
  }

  // ── Area (kelurahan) management ──────────────────────────────────────
  const handleAreaSelWilayah = async (level, kode, nama) => {
    if (level === 'prov') {
      const kab = await fetchWilayah('kabupaten', kode)
      setAreaWilayahData(d => ({ ...d, kabupaten: kab, kecamatan: [], kelurahan: [] }))
      setAreaSearchWilayah(s => ({ ...s, prov: kode, provNama: nama, kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '' }))
      setAreaDusunInput(''); setAreaDusunSuggestions([])
    } else if (level === 'kab') {
      const kec = await fetchWilayah('kecamatan', kode)
      setAreaWilayahData(d => ({ ...d, kecamatan: kec, kelurahan: [] }))
      setAreaSearchWilayah(s => ({ ...s, kab: kode, kabNama: nama, kec: '', kecNama: '', kel: '', kelNama: '' }))
      setAreaDusunInput(''); setAreaDusunSuggestions([])
    } else if (level === 'kec') {
      const kel = await fetchWilayah('kelurahan', kode)
      setAreaWilayahData(d => ({ ...d, kelurahan: kel }))
      setAreaSearchWilayah(s => ({ ...s, kec: kode, kecNama: nama, kel: '', kelNama: '' }))
      setAreaDusunInput(''); setAreaDusunSuggestions([])
    } else if (level === 'kel') {
      setAreaSearchWilayah(s => ({ ...s, kel: kode, kelNama: nama }))
      setAreaDusunInput('')
      try {
        const res = await fetch(`/api/territories/dusun/${kode}`, { headers: authHeader() })
        if (res.ok) setAreaDusunSuggestions(await res.json())
        else setAreaDusunSuggestions([])
      } catch { setAreaDusunSuggestions([]) }
    }
  }

  const handleAddArea = async () => {
    if (!managingAreasTerritoryId || !areaSearchWilayah.kel) {
      showToast('Pilih kelurahan terlebih dahulu', 'error'); return
    }
    try {
      const res = await fetch(`/api/territories/${managingAreasTerritoryId}/areas`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kelurahan_kode: areaSearchWilayah.kel,
          kelurahan_nama: areaSearchWilayah.kelNama,
          kecamatan_nama: areaSearchWilayah.kecNama,
          kabupaten_nama: areaSearchWilayah.kabNama,
          dusun_nama: areaDusunInput.trim()
        })
      })
      if (res.ok) {
        showToast('Area berhasil ditambahkan', 'success')
        setAreaSearchWilayah(s => ({ ...s, kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '' }))
        setAreaWilayahData(d => ({ ...d, kabupaten: [], kecamatan: [], kelurahan: [] }))
        setAreaDusunInput(''); setAreaDusunSuggestions([])
        const territoryRes = await fetch('/api/territories', { headers: authHeader() })
        if (territoryRes.ok) setTerritories(await territoryRes.json())
      } else {
        const err = await res.json()
        showToast(err.error || 'Gagal menambahkan area', 'error')
      }
    } catch { showToast('Gagal menambahkan area', 'error') }
  }

  const handleRemoveArea = async (areaId, label) => {
    requestConfirm('Hapus Area', `Hapus "${label}" dari wilayah ini?`, async () => {
      try {
        const res = await fetch(`/api/territories/${managingAreasTerritoryId}/areas/${areaId}`, {
          method: 'DELETE', headers: authHeader()
        })
        if (res.ok) {
          showToast('Area berhasil dihapus', 'success')
          const territoryRes = await fetch('/api/territories', { headers: authHeader() })
          if (territoryRes.ok) setTerritories(await territoryRes.json())
        }
      } catch { showToast('Gagal menghapus area', 'error') }
    }, 'warning')
  }

  // ── Collector area (dusun) management ───────────────────────────────
  const refreshCollectorAreas = async () => {
    const res = await fetch('/api/collector-areas', { headers: authHeader() })
    if (res.ok) setCollectorAreas(await res.json())
  }

  const handleAssignDusun = async () => {
    if (!assignDusunWilayah.kelKode || !assignDusunName.trim()) {
      showToast('Pilih kelurahan dan isi nama dusun/kampung', 'error'); return
    }
    setAssignDusunLoading(true)
    try {
      const res = await fetch('/api/collector-areas', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collector_id: assignDusunCollectorId,
          kelurahan_kode: assignDusunWilayah.kelKode,
          kelurahan_nama: assignDusunWilayah.kelNama,
          kecamatan_nama: assignDusunWilayah.kecNama,
          kabupaten_nama: assignDusunWilayah.kabNama,
          provinsi_nama: assignDusunWilayah.provNama,
          dusun_nama: assignDusunName.trim()
        })
      })
      let data = {}
      try { data = await res.json() } catch (_) {}
      if (res.ok) {
        showToast(`Dusun "${assignDusunName}" berhasil diassign`, 'success')
        setAssignDusunName('')
        await refreshCollectorAreas()
      } else {
        showToast(data.error || `Gagal assign dusun (HTTP ${res.status})`, 'error')
      }
    } catch (err) { showToast('Gagal assign dusun: ' + (err.message || 'network error'), 'error') }
    setAssignDusunLoading(false)
  }

  const handleRemoveCollectorArea = (areaId, dusunNama) => {
    requestConfirm('Hapus Dusun', `Lepas "${dusunNama}" dari kolektor ini?`, async () => {
      try {
        const res = await fetch(`/api/collector-areas/${areaId}`, { method: 'DELETE', headers: authHeader() })
        if (res.ok) {
          showToast('Dusun berhasil dihapus', 'success')
          await refreshCollectorAreas()
        }
      } catch { showToast('Gagal menghapus dusun', 'error') }
    }, 'warning')
  }

  const openAssignDusunModal = (collectorId) => {
    setAssignDusunCollectorId(collectorId)
    setAssignDusunName('')
    setAssignDusunWilayah({ prov: '', provNama: '', kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '', kelKode: '' })
    setAssignDusunWilayahData({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
    setShowAssignDusunModal(true)
    fetchWilayah('provinsi').then(prov => setAssignDusunWilayahData(d => ({ ...d, provinsi: prov })))
  }

  return {
    territories, setTerritories,
    showAddTerritoryModal, setShowAddTerritoryModal,
    newTerritory, setNewTerritory,
    editingTerritory, setEditingTerritory,
    managingAreasTerritoryId, setManagingAreasTerritoryId,
    areaSearchWilayah, setAreaSearchWilayah,
    areaWilayahData, setAreaWilayahData,
    areaDusunInput, setAreaDusunInput,
    areaDusunSuggestions, setAreaDusunSuggestions,
    collectorAreas, setCollectorAreas,
    assignDusunCollectorId, setAssignDusunCollectorId,
    assignDusunWilayah, setAssignDusunWilayah,
    assignDusunWilayahData, setAssignDusunWilayahData,
    assignDusunName, setAssignDusunName,
    assignDusunLoading, setAssignDusunLoading,
    showAssignDusunModal, setShowAssignDusunModal,
    handleCreateTerritory,
    handleDeleteTerritory,
    handleAreaSelWilayah,
    handleAddArea,
    handleRemoveArea,
    refreshCollectorAreas,
    handleAssignDusun,
    handleRemoveCollectorArea,
    openAssignDusunModal,
  }
}
