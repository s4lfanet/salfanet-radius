import { useState } from 'react'
import { compressImage, composeAddress } from '../utils/appUtils'

export function useWaitingList({ authHeader, showToast, requestConfirm }) {
  const fetchWilayah = async (level, kode) => {
    try {
      const res = await fetch(`/api/wilayah/${level}${kode ? '/' + kode : ''}`, { headers: authHeader() })
      return res.ok ? await res.json() : []
    } catch { return [] }
  }
  const [waitingList, setWaitingList] = useState([])
  const [wlLoading, setWlLoading] = useState(false)
  const [wlStatusFilter, setWlStatusFilter] = useState('waiting')
  const [wlSearch, setWlSearch] = useState('')
  const [showWlModal, setShowWlModal] = useState(false)
  const [wlEditEntry, setWlEditEntry] = useState(null)
  const [wlForm, setWlForm] = useState({ fullname: '', phone: '', identity_number: '', ktp_photo: null, notes: '', territory_id: '', territory_area_id: '', groupname: '', sales: '', latitude: '', longitude: '' })
  const [wlFormLoading, setWlFormLoading] = useState(false)
  const [showWlKtpModal, setShowWlKtpModal] = useState(false)
  const [wlKtpPreview, setWlKtpPreview] = useState(null)
  const [showWlPickerModal, setShowWlPickerModal] = useState(false)
  const [wlPickerList, setWlPickerList] = useState([])
  const [selectedWlEntry, setSelectedWlEntry] = useState(null)
  const [wlSelWilayah, setWlSelWilayah] = useState({ prov: '', kab: '', kec: '', kel: '', provNama: '', kabNama: '', kecNama: '', kelNama: '', dusun: '', rt: '', rw: '', detail: '' })
  const [wlWilayahData, setWlWilayahData] = useState({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] })
  const [wlDusunPicker, setWlDusunPicker] = useState(false)
  const [wlDusunOptions, setWlDusunOptions] = useState([])

  const fetchWaitingList = async (status = wlStatusFilter) => {
    setWlLoading(true)
    try {
      const params = status ? `?status=${status}` : ''
      const res = await fetch(`/api/waiting-list${params}`, { headers: authHeader() })
      if (res.ok) setWaitingList(await res.json())
    } catch (_) {}
    finally { setWlLoading(false) }
  }

  const handleWlSelWilayah = async (level, kode, nama) => {
    if (level === 'prov') {
      const kab = await fetchWilayah('kabupaten', kode)
      setWlWilayahData(d => ({ ...d, kabupaten: kab, kecamatan: [], kelurahan: [] }))
      setWlSelWilayah(s => ({ ...s, prov: kode, provNama: nama, kab: '', kabNama: '', kec: '', kecNama: '', kel: '', kelNama: '' }))
    } else if (level === 'kab') {
      const kec = await fetchWilayah('kecamatan', kode)
      setWlWilayahData(d => ({ ...d, kecamatan: kec, kelurahan: [] }))
      setWlSelWilayah(s => ({ ...s, kab: kode, kabNama: nama, kec: '', kecNama: '', kel: '', kelNama: '' }))
    } else if (level === 'kec') {
      const kel = await fetchWilayah('kelurahan', kode)
      setWlWilayahData(d => ({ ...d, kelurahan: kel }))
      setWlSelWilayah(s => ({ ...s, kec: kode, kecNama: nama, kel: '', kelNama: '' }))
    } else if (level === 'kel') {
      setWlSelWilayah(s => ({ ...s, kel: kode, kelNama: nama }))
      setWlDusunPicker(false)
      setWlDusunOptions([])
      setWlForm(f => ({ ...f, territory_id: '' }))
      try {
        const res = await fetch(`/api/territories/by-kelurahan/${kode}`, { headers: authHeader() })
        if (res.ok) {
          const result = await res.json()
          if (result && result.single === true) {
            setWlForm(f => ({ ...f, territory_id: String(result.territory.territory_id || result.territory.id) }))
          } else if (result && result.single === false) {
            setWlDusunOptions(result.options)
            setWlDusunPicker(true)
          }
        }
      } catch {}
    }
  }

  const handleWlPhotoChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const compressed = await compressImage(file)
      setWlForm(f => ({ ...f, ktp_photo: compressed }))
    } catch {
      const reader = new FileReader()
      reader.onload = (ev) => setWlForm(f => ({ ...f, ktp_photo: ev.target.result }))
      reader.readAsDataURL(file)
    }
  }

  const submitWlForm = async () => {
    if (!wlForm.fullname.trim()) return showToast('Nama wajib diisi', 'error')
    if (!wlForm.groupname) return showToast('Paket internet wajib dipilih', 'error')
    if (!wlEditEntry && !wlForm.ktp_photo) return showToast('Foto KTP wajib diupload', 'error')
    if (!wlForm.latitude || !wlForm.longitude) return showToast('Koordinat lokasi pelanggan wajib diisi — salin dari Google Maps', 'error')
    if (wlForm.identity_number && !/^\d{16}$/.test(wlForm.identity_number)) return showToast('NIK harus tepat 16 digit angka', 'error')
    if (wlForm.phone && !/^\d+$/.test(wlForm.phone)) return showToast('Nomor telepon hanya boleh berisi angka', 'error')
    setWlFormLoading(true)
    try {
      const address = composeAddress(wlSelWilayah) || wlEditEntry?.address || ''
      const body = { ...wlForm, address, territory_id: wlForm.territory_id || null, territory_area_id: wlForm.territory_area_id || null, kelurahan_kode: wlSelWilayah.kel || null,
        latitude: wlForm.latitude || null, longitude: wlForm.longitude || null }
      if (!wlForm.ktp_photo) delete body.ktp_photo
      const url = wlEditEntry ? `/api/waiting-list/${wlEditEntry.id}` : '/api/waiting-list'
      const method = wlEditEntry ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { ...authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan')
      showToast(data.message || 'Berhasil', 'success')
      setShowWlModal(false)
      fetchWaitingList()
    } catch (err) { showToast(err.message, 'error') }
    finally { setWlFormLoading(false) }
  }

  const cancelWlEntry = (id, name) => {
    requestConfirm('Batalkan Waiting List', `Batalkan "${name}" dari waiting list?`, async () => {
      try {
        const res = await fetch(`/api/waiting-list/${id}`, { method: 'DELETE', headers: authHeader() })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        showToast(data.message || 'Dibatalkan', 'success')
        fetchWaitingList()
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  const restoreWlEntry = (id, name) => {
    requestConfirm('Kembalikan ke Waiting List', `Kembalikan "${name}" ke waiting list?`, async () => {
      try {
        const res = await fetch(`/api/waiting-list/${id}/restore`, { method: 'POST', headers: authHeader() })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        showToast(data.message || 'Berhasil dikembalikan', 'success')
        fetchWaitingList()
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  const viewWlKtp = async (id) => {
    try {
      const res = await fetch(`/api/waiting-list/${id}/ktp`, { headers: authHeader() })
      const data = await res.json()
      setWlKtpPreview(data.ktp_photo)
      setShowWlKtpModal(true)
    } catch (_) { showToast('Gagal memuat foto KTP', 'error') }
  }

  const openWlPicker = async () => {
    try {
      const res = await fetch('/api/waiting-list?status=waiting', { headers: authHeader() })
      if (res.ok) setWlPickerList(await res.json())
      setShowWlPickerModal(true)
    } catch (_) { showToast('Gagal memuat waiting list', 'error') }
  }

  return {
    waitingList, setWaitingList,
    wlLoading, setWlLoading,
    wlStatusFilter, setWlStatusFilter,
    wlSearch, setWlSearch,
    showWlModal, setShowWlModal,
    wlEditEntry, setWlEditEntry,
    wlForm, setWlForm,
    wlFormLoading, setWlFormLoading,
    showWlKtpModal, setShowWlKtpModal,
    wlKtpPreview, setWlKtpPreview,
    showWlPickerModal, setShowWlPickerModal,
    wlPickerList, setWlPickerList,
    selectedWlEntry, setSelectedWlEntry,
    wlSelWilayah, setWlSelWilayah,
    wlWilayahData, setWlWilayahData,
    wlDusunPicker, setWlDusunPicker,
    wlDusunOptions, setWlDusunOptions,
    fetchWaitingList,
    handleWlSelWilayah,
    handleWlPhotoChange,
    submitWlForm,
    cancelWlEntry,
    restoreWlEntry,
    viewWlKtp,
    openWlPicker,
  }
}
