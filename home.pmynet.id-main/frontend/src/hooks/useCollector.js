import { useState } from 'react'

export function useCollector({ authHeader, showToast, requestConfirm }) {
  const [collectorHistory, setCollectorHistory] = useState([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [collectorList, setCollectorList] = useState([])
  const [showCollectorProofModal, setShowCollectorProofModal] = useState(false)
  const [collectorProofData, setCollectorProofData] = useState(null)
  const [collectorProofLoading, setCollectorProofLoading] = useState(false)
  const [collectorSetoran, setCollectorSetoran] = useState([])
  const [setoranDate, setSetoranDate] = useState(new Date().toISOString().slice(0, 10))
  const [setoranSearch, setSetoranSearch] = useState('')
  const [expandedCollector, setExpandedCollector] = useState(null)
  const [expandedCollectors, setExpandedCollectors] = useState(new Set())
  const [showCabutModal, setShowCabutModal] = useState(false)
  const [cabutTarget, setCabutTarget] = useState(null)
  const [cabutNotes, setCabutNotes] = useState('')
  const [cabutLoading, setCabutLoading] = useState(false)
  const [ontRemovals, setOntRemovals] = useState([])
  const [ontRemovalsMeta, setOntRemovalsMeta] = useState({ thisMonth: 0, lastMonth: 0 })

  // financePeriod diterima sebagai param saat dipanggil (hindari stale closure)
  const fetchSetoran = async (financePeriod) => {
    try {
      const res = await fetch(`/api/collector/setoran?period=${financePeriod}&date=${setoranDate}`, { headers: authHeader() })
      if (res.ok) setCollectorSetoran(await res.json())
    } catch (err) { console.error('Error fetching setoran:', err) }
  }

  const fetchCollectorHistory = async () => {
    try {
      const res = await fetch('/api/collector/history?months=6', { headers: authHeader() })
      if (res.ok) { setCollectorHistory(await res.json()); setHistoryLoaded(true) }
    } catch (err) { console.error('Error fetching collector history:', err) }
  }

  const handleViewCollectorProof = async (invoiceId) => {
    setCollectorProofData(null)
    setCollectorProofLoading(true)
    setShowCollectorProofModal(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/collector-proof`, { headers: authHeader() })
      const data = await res.json()
      if (res.ok) setCollectorProofData(data.image)
      else setCollectorProofData(null)
    } catch (_) { setCollectorProofData(null) }
    finally { setCollectorProofLoading(false) }
  }

  const fetchOntRemovals = async () => {
    try {
      const res = await fetch('/api/collector/ont-removals', { headers: authHeader() })
      if (!res.ok) return
      const data = await res.json()
      setOntRemovals(data.removals || [])
      setOntRemovalsMeta({ thisMonth: data.thisMonth || 0, lastMonth: data.lastMonth || 0 })
    } catch (_) {}
  }

  const fetchCollectorList = async () => {
    try {
      const res = await fetch('/api/system/users', { headers: authHeader() })
      if (res.ok) {
        const all = await res.json()
        setCollectorList(all.filter(u => u.role === 'collector'))
      }
    } catch (_) {}
  }

  const openCabutModal = (u) => {
    setCabutTarget(u)
    setCabutNotes('')
    setShowCabutModal(true)
  }

  const submitCabut = async () => {
    if (!cabutTarget) return
    setCabutLoading(true)
    try {
      const res = await fetch('/api/ont-removals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ username: cabutTarget.username, notes: cabutNotes })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      showToast(`ONT ${cabutTarget.fullname || cabutTarget.username} berhasil dicatat`, 'success')
      setShowCabutModal(false)
      setCabutTarget(null)
      setCabutNotes('')
      fetchOntRemovals()
    } catch (err) { showToast(err.message, 'error') }
    finally { setCabutLoading(false) }
  }

  return {
    collectorHistory, setCollectorHistory,
    historyLoaded, setHistoryLoaded,
    collectorList, setCollectorList,
    showCollectorProofModal, setShowCollectorProofModal,
    collectorProofData, setCollectorProofData,
    collectorProofLoading, setCollectorProofLoading,
    collectorSetoran, setCollectorSetoran,
    setoranDate, setSetoranDate,
    setoranSearch, setSetoranSearch,
    expandedCollector, setExpandedCollector,
    expandedCollectors, setExpandedCollectors,
    showCabutModal, setShowCabutModal,
    cabutTarget, setCabutTarget,
    cabutNotes, setCabutNotes,
    cabutLoading, setCabutLoading,
    ontRemovals, setOntRemovals,
    ontRemovalsMeta, setOntRemovalsMeta,
    fetchSetoran,
    fetchCollectorHistory,
    handleViewCollectorProof,
    fetchOntRemovals,
    fetchCollectorList,
    openCabutModal,
    submitCabut,
  }
}
