import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { compressImage } from '../utils/appUtils'
import { monthLabel } from '../utils/format'

export function useBilling({
  authHeader,
  showToast,
  requestConfirm,
  requestCritical,
  setIsSilentRefetching,
  setPendingProofsCount,
  fetchData,
  currentUser,
}) {
  // Internal abort ref for invoice fetches
  const billingAbortRef = useRef(null)

  // ── Invoice state ────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState([])
  const [invoiceFilter, setInvoiceFilter] = useState({ period: new Date().toISOString().slice(0, 7), status: 'all', search: '' })
  const [invoicePagination, setInvoicePagination] = useState({ currentPage: 1, entriesPerPage: 10 })
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])
  const [showGenerateInvoiceModal, setShowGenerateInvoiceModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showSyncAddonModal, setShowSyncAddonModal] = useState(false)
  const [syncingAddon, setSyncingAddon] = useState(false)

  // ── Payment modal state ──────────────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [transferProofFile, setTransferProofFile] = useState(null)
  const [transferProofPreview, setTransferProofPreview] = useState(null)
  const [receiptModal, setReceiptModal] = useState(null)

  // ── Bulk pay state ───────────────────────────────────────────────────────────
  const [showBulkPayModal, setShowBulkPayModal] = useState(false)
  const [bulkPayMethod, setBulkPayMethod] = useState('cash')
  const [bulkPayProof, setBulkPayProof] = useState(null)
  const [bulkPayLoading, setBulkPayLoading] = useState(false)

  // ── Discount modal state ─────────────────────────────────────────────────────
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountTarget, setDiscountTarget] = useState(null)
  const [discountReason, setDiscountReason] = useState('')

  // ── Edit payment method state ────────────────────────────────────────────────
  const [editPayMethodModal, setEditPayMethodModal] = useState(null)
  const [editPayMethodValue, setEditPayMethodValue] = useState('cash')
  const [editPayMethodLoading, setEditPayMethodLoading] = useState(false)

  // ── Cancel invoice state ─────────────────────────────────────────────────────
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState(null)
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState('')
  const [cancelInvoiceLoading, setCancelInvoiceLoading] = useState(false)

  // ── Settlement state ─────────────────────────────────────────────────────────
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [settlementData, setSettlementData] = useState([])
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementSearch, setSettlementSearch] = useState('')
  const [settlementMode, setSettlementMode] = useState('daily')
  const [settlementDateFrom, setSettlementDateFrom] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [settlementDateTo, setSettlementDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [settlementFilterCollector, setSettlementFilterCollector] = useState('')
  const [settlementRangeData, setSettlementRangeData] = useState(null)
  const [settlementRangeLoading, setSettlementRangeLoading] = useState(false)
  const [settlementDetail, setSettlementDetail] = useState(null)
  const [showSettlementDetail, setShowSettlementDetail] = useState(false)
  const [settlementConfirmLoading, setSettlementConfirmLoading] = useState(false)

  // ── IP Pool state ────────────────────────────────────────────────────────────
  const [ipPools, setIpPools] = useState([])
  const [showAddPoolModal, setShowAddPoolModal] = useState(false)
  const [showEditPoolModal, setShowEditPoolModal] = useState(false)
  const [newPool, setNewPool] = useState({ pool_name: '', description: '' })
  const [editingPool, setEditingPool] = useState(null)
  const [editPoolName, setEditPoolName] = useState('')

  // ── Payment proof state ──────────────────────────────────────────────────────
  const [paymentProofs, setPaymentProofs] = useState([])
  const [proofsFilter, setProofsFilter] = useState('pending')
  const [proofsSearch, setProofsSearch] = useState('')
  const [proofsVisibleCount, setProofsVisibleCount] = useState(10)
  const [showProofImageModal, setShowProofImageModal] = useState(false)
  const [proofImageData, setProofImageData] = useState(null)
  const [proofImageLoading, setProofImageLoading] = useState(false)
  const [proofVerifyLoading, setProofVerifyLoading] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  // ── Payment Gateway state ────────────────────────────────────────────────────
  const [showPGModal, setShowPGModal] = useState(false)
  const [pgInvoice, setPgInvoice] = useState(null)
  const [paymentGatewayConfig, setPaymentGatewayConfig] = useState({})
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const [showPGSettingsModal, setShowPGSettingsModal] = useState(false)
  const [pgSettings, setPgSettings] = useState({
    pg_duitku_active: '0', pg_duitku_merchant_code: '', pg_duitku_api_key: '', pg_duitku_sandbox: '1',
    pg_tripay_active: '0', pg_tripay_merchant_code: '', pg_tripay_api_key: '', pg_tripay_private_key: '', pg_tripay_sandbox: '1',
    pg_xendit_active: '0', pg_xendit_api_key: '', pg_xendit_webhook_token: '',
    pg_midtrans_active: '0', pg_midtrans_server_key: '', pg_midtrans_client_key: '', pg_midtrans_sandbox: '1',
    pg_app_base_url: '',
    transfer_bank_name: '', transfer_account_number: '', transfer_account_name: '',
    transfer_bank_2_name: '', transfer_bank_2_number: '', transfer_bank_2_account: ''
  })

  // ── Invoice fetches ──────────────────────────────────────────────────────────
  const fetchInvoices = async () => {
    try {
      const { period, status, search } = invoiceFilter
      let url = `/api/invoices?period=${period}&status=${status}`
      if (search) url += `&search=${encodeURIComponent(search)}`
      const res = await fetch(url, { headers: authHeader() })
      if (res.ok) setInvoices(await res.json())
    } catch (err) { console.error('Error fetching invoices:', err) }
  }

  const silentRefreshInvoices = async () => {
    if (billingAbortRef.current) billingAbortRef.current.abort()
    const ctrl = new AbortController()
    billingAbortRef.current = ctrl
    try {
      setIsSilentRefetching(true)
      const headers = authHeader()
      const params = new URLSearchParams({
        period: invoiceFilter.period,
        status: invoiceFilter.status,
        ...(invoiceFilter.username ? { username: invoiceFilter.username } : {})
      })
      const res = await fetch(`/api/invoices?${params}`, { headers, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.ok) setInvoices(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') console.error('silentRefreshInvoices error:', e)
    } finally {
      setIsSilentRefetching(false)
    }
  }

  // ── Payment proof fetches ────────────────────────────────────────────────────
  const fetchPaymentProofs = async (status = proofsFilter) => {
    try {
      const res = await fetch(`/api/admin/payment-proofs?status=${status}`, { headers: authHeader() })
      if (res.ok) setPaymentProofs(await res.json())
    } catch (err) { console.error('Proof fetch error', err) }
  }

  const handleViewProofImage = async (proofId) => {
    setProofImageLoading(true)
    setShowProofImageModal(true)
    setProofImageData(null)
    try {
      const res = await fetch(`/api/admin/payment-proofs/${proofId}/image`, { headers: authHeader() })
      if (res.ok) {
        const data = await res.json()
        setProofImageData(data.image)
      }
    } catch (err) { showToast('Gagal memuat gambar', 'error') }
    finally { setProofImageLoading(false) }
  }

  const handleVerifyProof = async (proofId, action, reason = '') => {
    setProofVerifyLoading(true)
    try {
      const res = await fetch(`/api/admin/payment-proofs/${proofId}/verify`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reject_reason: reason })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal verifikasi')
      showToast(data.message || 'Berhasil', 'success')
      setShowProofImageModal(false)
      setShowRejectModal(false)
      fetchPaymentProofs()
      fetchInvoices()
      setPendingProofsCount(prev => Math.max(0, prev - 1))
    } catch (err) { showToast('Error: ' + err.message, 'error') }
    finally { setProofVerifyLoading(false) }
  }

  // ── Payment Gateway ──────────────────────────────────────────────────────────
  const fetchPGConfig = async () => {
    try {
      const res = await fetch('/api/payment-gateway/config', { headers: authHeader() })
      if (res.ok) {
        const data = await res.json()
        setPaymentGatewayConfig(data)
        setPgSettings(prev => ({ ...prev, ...data }))
      }
    } catch (err) { console.error('PG config fetch error', err) }
  }

  const handleOpenPGModal = (invoice) => {
    setPgInvoice(invoice)
    setPaymentResult(null)
    fetchPGConfig()
    setShowPGModal(true)
  }

  const handleCreatePayment = async (gateway) => {
    if (!pgInvoice) return
    setPaymentLoading(true)
    try {
      const res = await fetch('/api/payment-gateway/create', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: pgInvoice.id, gateway })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal membuat link pembayaran')
      setPaymentResult(data)
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleSavePGSettings = async () => {
    try {
      const res = await fetch('/api/payment-gateway/config', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(pgSettings)
      })
      if (!res.ok) throw new Error('Gagal menyimpan')
      showToast('Konfigurasi payment gateway berhasil disimpan', 'success')
      setShowPGSettingsModal(false)
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error')
    }
  }

  // ── Edit payment method ──────────────────────────────────────────────────────
  const handleEditPaymentMethod = async () => {
    if (!editPayMethodModal) return
    setEditPayMethodLoading(true)
    try {
      const res = await fetch(`/api/invoices/${editPayMethodModal.id}/payment-method`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: editPayMethodValue })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      showToast(`✅ ${data.message}`, 'success')
      setInvoices(prev => prev.map(i => i.id === editPayMethodModal.id ? { ...i, payment_method: editPayMethodValue } : i))
      setEditPayMethodModal(null)
    } catch (err) {
      showToast('❌ ' + err.message, 'error')
    } finally {
      setEditPayMethodLoading(false)
    }
  }

  // ── Delete invoice ───────────────────────────────────────────────────────────
  const handleDeleteInvoice = (inv) => {
    requestCritical(
      'Hapus Invoice Permanen',
      `Kamu akan menghapus invoice #INV-${String(inv.id).padStart(5,'0')} milik ${inv.fullname || inv.username} (${monthLabel(inv.period)}) secara permanen dari database. Tindakan ini tidak bisa diurungkan.`,
      async (admin_password) => {
        const res = await fetch(`/api/admin/invoices/${inv.id}`, {
          method: 'DELETE',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password })
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        showToast(d.message, 'success')
        if (settlementDetail) fetchSettlementDetail(settlementDetail.collector.id, settlementDate)
        fetchSettlements(settlementDate)
      }
    )
  }

  // ── Invoice generation ───────────────────────────────────────────────────────
  const handleGenerateInvoices = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ period: invoiceFilter.period })
      })
      const data = await res.json()
      if (res.ok) {
        showToast(data.message, 'success')
        fetchInvoices()
        setShowGenerateInvoiceModal(false)
      } else throw new Error(data.error)
    } catch (err) { showToast(err.message, 'error') }
    finally { setGenerating(false) }
  }

  // ── Pay invoice ──────────────────────────────────────────────────────────────
  const handlePayInvoice = (id, username, amount, period) => {
    setPaymentTarget({ id, username, amount, period })
    setPaymentMethod('cash')
    setTransferProofFile(null)
    setTransferProofPreview(null)
    setShowPaymentModal(true)
  }

  const handleTransferProofSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setTransferProofFile(file)
    try {
      const compressed = await compressImage(file, 1200, 0.80)
      setTransferProofPreview(compressed)
    } catch {
      const reader = new FileReader()
      reader.onload = (ev) => setTransferProofPreview(ev.target.result)
      reader.readAsDataURL(file)
    }
  }

  const submitPayment = async (e) => {
    e.preventDefault()
    if (!paymentTarget) return
    if (paymentMethod === 'transfer' && !transferProofPreview && currentUser?.role !== 'admin') {
      showToast('Harap upload bukti transfer terlebih dahulu', 'error')
      return
    }
    try {
      const body = { payment_method: paymentMethod }
      if (paymentMethod === 'transfer' && transferProofPreview) {
        body.proof_image = transferProofPreview
      }
      const res = await fetch(`/api/invoices/${paymentTarget.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal update status')
      showToast(`Pembayaran untuk ${paymentTarget.username} berhasil diverifikasi`, 'success')
      setInvoices(prev => prev.map(inv =>
        inv.id === paymentTarget.id
          ? { ...inv, status: 'paid', payment_method: paymentMethod, paid_at: new Date().toISOString() }
          : inv
      ))
      setShowPaymentModal(false)
      const paidInv = invoices.find(i => i.id === paymentTarget.id)
      setPaymentTarget(null)
      setTransferProofFile(null)
      setTransferProofPreview(null)
      if (paidInv) setReceiptModal({ ...paidInv, status: 'paid', payment_method: paymentMethod, paid_at: new Date().toISOString() })
      silentRefreshInvoices()
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleQuickPayCash = (inv) => {
    requestConfirm(
      'Konfirmasi Lunas (Cash)',
      `Tandai #INV-${String(inv.id).padStart(5,'0')} — ${inv.fullname || inv.username} sebagai LUNAS (Cash)?`,
      async () => {
        try {
          const res = await fetch(`/api/invoices/${inv.id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ payment_method: 'cash' })
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Gagal')
          showToast(`${inv.fullname || inv.username} — Lunas ✓`, 'success')
          const paidAt = new Date().toISOString()
          setInvoices(prev => prev.map(i =>
            i.id === inv.id ? { ...i, status: 'paid', payment_method: 'cash', paid_at: paidAt } : i
          ))
          setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id))
          setReceiptModal({ ...inv, status: 'paid', payment_method: 'cash', paid_at: paidAt })
          silentRefreshInvoices()
        } catch (err) { showToast(err.message, 'error') }
      }
    )
  }

  // ── Bulk pay ─────────────────────────────────────────────────────────────────
  const submitBulkPay = async () => {
    if (selectedInvoiceIds.length === 0) return
    if (bulkPayMethod === 'transfer' && !bulkPayProof && currentUser?.role !== 'admin') {
      showToast('Upload bukti transfer terlebih dahulu', 'error')
      return
    }
    setBulkPayLoading(true)
    try {
      const res = await fetch('/api/invoices/bulk-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          invoice_ids: selectedInvoiceIds,
          payment_method: bulkPayMethod,
          proof_image: bulkPayProof || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      showToast(`✅ ${data.paid} invoice berhasil dilunasi${data.skipped ? `, ${data.skipped} dilewati` : ''}`, 'success')
      setInvoices(prev => prev.map(i =>
        selectedInvoiceIds.includes(i.id) && i.status === 'unpaid'
          ? { ...i, status: 'paid', payment_method: bulkPayMethod, paid_at: new Date().toISOString() }
          : i
      ))
      setSelectedInvoiceIds([])
      setShowBulkPayModal(false)
      setBulkPayProof(null)
      setBulkPayMethod('cash')
      silentRefreshInvoices()
    } catch (err) { showToast(err.message, 'error') }
    finally { setBulkPayLoading(false) }
  }

  // ── Discount ─────────────────────────────────────────────────────────────────
  const openDiscountModal = (inv) => {
    setDiscountTarget({ id: inv.id, username: inv.username, amount: inv.amount, period: inv.period, fullname: inv.fullname })
    setDiscountReason('')
    setShowDiscountModal(true)
  }

  const submitDiscount = async () => {
    if (!discountTarget) return
    try {
      const res = await fetch(`/api/invoices/${discountTarget.id}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ reason: discountReason })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal apply diskon')
      showToast(`Diskon berhasil diterapkan untuk ${discountTarget.username} (${discountTarget.period})`, 'success')
      setInvoices(prev => prev.map(inv =>
        inv.id === discountTarget.id
          ? { ...inv, status: 'paid', payment_method: 'discount', discount: inv.amount, paid_at: new Date().toISOString() }
          : inv
      ))
      setShowDiscountModal(false)
      setDiscountTarget(null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // ── Settlement ───────────────────────────────────────────────────────────────
  const fetchSettlements = async (date = settlementDate) => {
    setSettlementLoading(true)
    try {
      const res = await fetch(`/api/admin/collector-settlements?date=${date}`, { headers: authHeader() })
      if (res.ok) { const d = await res.json(); setSettlementData(d.collectors || []) }
    } catch (_) {} finally { setSettlementLoading(false) }
  }

  const fetchSettlementRange = async () => {
    setSettlementRangeLoading(true)
    try {
      const params = new URLSearchParams({ date_from: settlementDateFrom, date_to: settlementDateTo })
      if (settlementFilterCollector) params.append('collector_id', settlementFilterCollector)
      const res = await fetch(`/api/admin/collector-settlements/range?${params}`, { headers: authHeader() })
      if (res.ok) setSettlementRangeData(await res.json())
    } catch (_) {} finally { setSettlementRangeLoading(false) }
  }

  const fetchSettlementDetail = async (collectorId, date) => {
    try {
      const res = await fetch(`/api/admin/collector-settlements/${collectorId}/${date}`, { headers: authHeader() })
      if (res.ok) { setSettlementDetail(await res.json()); setShowSettlementDetail(true) }
    } catch (_) { showToast('Gagal memuat detail', 'error') }
  }

  const confirmSettlement = async (collectorId, date, notes = '') => {
    setSettlementConfirmLoading(true)
    try {
      const res = await fetch(`/api/admin/collector-settlements/${collectorId}/${date}/confirm`, {
        method: 'POST', headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      showToast(d.message, 'success')
      fetchSettlements(settlementDate)
      if (showSettlementDetail) fetchSettlementDetail(collectorId, date)
    } catch (err) { showToast(err.message, 'error') }
    finally { setSettlementConfirmLoading(false) }
  }

  const unconfirmSettlement = async (collectorId, date) => {
    requestConfirm('Hapus Konfirmasi', 'Hapus konfirmasi setoran ini?', async () => {
      try {
        const res = await fetch(`/api/admin/collector-settlements/${collectorId}/${date}/confirm`, { method: 'DELETE', headers: authHeader() })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        showToast(d.message, 'success')
        fetchSettlements(settlementDate)
        if (showSettlementDetail) fetchSettlementDetail(collectorId, date)
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  const submitCancelInvoice = async (admin_password) => {
    if (!cancelInvoiceTarget) return
    const res = await fetch(`/api/admin/invoices/${cancelInvoiceTarget.id}/cancel-payment`, {
      method: 'POST', headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelInvoiceReason, admin_password })
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error)
    showToast(d.message, 'success')
    setCancelInvoiceTarget(null)
    setCancelInvoiceReason('')
    if (settlementDetail) fetchSettlementDetail(settlementDetail.collector.id, settlementDate)
    fetchSettlements(settlementDate)
  }

  // ── IP Pools ─────────────────────────────────────────────────────────────────
  const handleCreatePool = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/ippools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(newPool)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal membuat IP pool')
      setNewPool({ pool_name: '', description: '' })
      setShowAddPoolModal(false)
      fetchData(true)
      showToast(`IP Pool '${data.pool_name}' berhasil ditambahkan`, 'success')
    } catch (err) { showToast(err.message, 'error') }
  }

  const prepareEditPool = (pool) => {
    setEditingPool(pool)
    setEditPoolName(pool.pool_name)
    setShowEditPoolModal(true)
  }

  const handleEditPoolSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/ippools/${editingPool.pool_name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ newName: editPoolName })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowEditPoolModal(false)
      fetchData(true)
      showToast('Nama Pool berhasil diubah', 'success')
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleDeletePool = (name) => {
    requestConfirm('Hapus IP Pool', `Apakah Anda yakin ingin menghapus pool ${name}? IP yang tersisa tidak dapat diikat ke pelanggan baru.`, async () => {
      try {
        await fetch(`/api/ippools/${name}`, { method: 'DELETE', headers: authHeader() })
        fetchData(true)
        showToast('Pool berhasil dihapus', 'success')
      } catch (err) { showToast('Gagal menghapus pool', 'error') }
    }, 'danger')
  }

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const exportExcel = (invoices, byDusun, discounts, period) => {
    const wb = XLSX.utils.book_new()

    const paidInv = invoices.filter(i => i.status === 'paid' && i.payment_method !== 'discount')
    const discountInv = invoices.filter(i => i.payment_method === 'discount')
    const unpaidInv = invoices.filter(i => i.status !== 'paid')
    const totalOmzet = paidInv.reduce((s, i) => s + Number(i.amount), 0)
    const totalDiskon = discountInv.reduce((s, i) => s + Number(i.amount), 0)
    const totalPiutang = unpaidInv.reduce((s, i) => s + Number(i.amount), 0)
    const summaryData = [
      ['Laporan Keuangan', period],
      [],
      ['Keterangan', 'Jumlah', 'Total (Rp)'],
      ['Lunas (Omzet)', paidInv.length, totalOmzet],
      ['Diskon', discountInv.length, totalDiskon],
      ['Belum Bayar', unpaidInv.length, totalPiutang],
      ['Total Invoice', invoices.length, totalOmzet + totalDiskon + totalPiutang],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan')

    const invHeaders = ['No', 'Username', 'Nama', 'Periode', 'Jumlah (Rp)', 'Status', 'Metode Bayar', 'Tgl Bayar', 'Dusun']
    const invRows = invoices.map((inv, idx) => [
      idx + 1,
      inv.username,
      inv.fullname || '',
      monthLabel(inv.period),
      Number(inv.amount),
      inv.status === 'paid' ? (inv.payment_method === 'discount' ? 'Diskon' : 'Lunas') : 'Belum Bayar',
      inv.payment_method || '-',
      inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('id-ID') : '-',
      inv.dusun_nama || '-',
    ])
    const ws2 = XLSX.utils.aoa_to_sheet([invHeaders, ...invRows])
    ws2['!cols'] = [{ wch: 4 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Invoice')

    if (byDusun && byDusun.length > 0) {
      const dusunHeaders = ['Dusun', 'Total', 'Lunas', 'Diskon', 'Belum Bayar', 'Omzet']
      const dusunRows = byDusun.map(d => [
        d.dusun || '(Tanpa Dusun)',
        Number(d.paid_count) + Number(d.discount_count) + Number(d.unpaid_count),
        Number(d.paid_count),
        Number(d.discount_count),
        Number(d.unpaid_count),
        Number(d.omzet),
      ])
      const ws3 = XLSX.utils.aoa_to_sheet([dusunHeaders, ...dusunRows])
      XLSX.utils.book_append_sheet(wb, ws3, 'Rekap Per Dusun')
    }

    if (discounts && discounts.length > 0) {
      const discHeaders = ['Username', 'Nama', 'Periode', 'Jumlah', 'Alasan', 'Tgl']
      const discRows = discounts.map(d => [
        d.username,
        d.fullname || '-',
        d.period,
        Number(d.amount),
        d.discount_reason || '-',
        d.paid_at ? new Date(d.paid_at).toLocaleDateString('id-ID') : '-',
      ])
      const ws4 = XLSX.utils.aoa_to_sheet([discHeaders, ...discRows])
      XLSX.utils.book_append_sheet(wb, ws4, 'Diskon')
    }

    XLSX.writeFile(wb, `laporan-keuangan-${period}.xlsx`)
  }

  // ── Export PDF ───────────────────────────────────────────────────────────────
  const exportPDF = (invoices, byDusun, discounts, period) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const fmtRp = (v) => 'Rp ' + Number(v).toLocaleString('id-ID')

    const paidInv    = invoices.filter(i => i.status === 'paid' && i.payment_method !== 'discount')
    const discountInv = invoices.filter(i => i.payment_method === 'discount')
    const unpaidInv  = invoices.filter(i => i.status !== 'paid')
    const totalOmzet = paidInv.reduce((s, i) => s + Number(i.amount), 0)
    const totalDiskon = discountInv.reduce((s, i) => s + Number(i.amount), 0)
    const totalPiutang = unpaidInv.reduce((s, i) => s + Number(i.amount), 0)

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Laporan Keuangan', pageW / 2, 18, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Periode: ${monthLabel(period)}`, pageW / 2, 25, { align: 'center' })
    doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })}`, pageW / 2, 30, { align: 'center' })

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan', 14, 40)
    autoTable(doc, {
      startY: 43,
      head: [['Keterangan', 'Jumlah Invoice', 'Total']],
      body: [
        ['Lunas (Omzet)', paidInv.length, fmtRp(totalOmzet)],
        ['Diskon', discountInv.length, fmtRp(totalDiskon)],
        ['Belum Bayar', unpaidInv.length, fmtRp(totalPiutang)],
        ['Total', invoices.length, fmtRp(totalOmzet + totalDiskon + totalPiutang)],
      ],
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 255, 250] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
      styles: { fontSize: 9 },
    })

    if (byDusun && byDusun.length > 0) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Rekap Per Dusun', 14, doc.lastAutoTable.finalY + 10)
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 13,
        head: [['Dusun', 'Total', 'Lunas', 'Diskon', 'Belum Bayar', 'Omzet']],
        body: byDusun.map(d => [
          d.dusun || '(Tanpa Dusun)',
          Number(d.paid_count) + Number(d.discount_count) + Number(d.unpaid_count),
          Number(d.paid_count),
          Number(d.discount_count),
          Number(d.unpaid_count),
          fmtRp(d.omzet),
        ]),
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 255] },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' } },
        styles: { fontSize: 9 },
      })
    }

    if (discounts && discounts.length > 0) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Rekap Diskon', 14, doc.lastAutoTable.finalY + 10)
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 13,
        head: [['Username', 'Nama', 'Periode', 'Jumlah Diskon', 'Alasan', 'Tgl']],
        body: discounts.map(d => [
          d.username,
          d.fullname || '-',
          d.period,
          fmtRp(d.amount),
          d.discount_reason || '-',
          d.paid_at ? new Date(d.paid_at).toLocaleDateString('id-ID') : '-',
        ]),
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        columnStyles: { 3: { halign: 'right' } },
        styles: { fontSize: 8 },
      })
    }

    doc.addPage()
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Detail Invoice — ${period}`, 14, 15)
    autoTable(doc, {
      startY: 19,
      head: [['Username', 'Nama', 'Periode', 'Nominal', 'Status', 'Tgl Bayar']],
      body: invoices.map(inv => [
        inv.username,
        inv.fullname || '-',
        monthLabel(inv.period),
        fmtRp(inv.amount),
        inv.status === 'paid' ? (inv.payment_method === 'discount' ? 'Diskon' : 'Lunas') : 'Belum Bayar',
        inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('id-ID') : '-',
      ]),
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: { 3: { halign: 'right' } },
      styles: { fontSize: 8 },
    })

    const totalPages = doc.internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(150)
      doc.text(`Halaman ${p} dari ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
      doc.text('billing.pmynet.id', 14, doc.internal.pageSize.getHeight() - 8)
      doc.setTextColor(0)
    }

    doc.save(`laporan-keuangan-${period}.pdf`)
  }

  const handleSyncAddons = async () => {
    setSyncingAddon(true)
    try {
      const res = await fetch('/api/billing/sync-addons', { method: 'POST', headers: authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`✅ ${data.message}`, 'success')
      setShowSyncAddonModal(false)
      fetchInvoices()
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error')
    } finally {
      setSyncingAddon(false)
    }
  }

  return {
    // Invoice
    invoices, setInvoices,
    invoiceFilter, setInvoiceFilter,
    invoicePagination, setInvoicePagination,
    selectedInvoiceIds, setSelectedInvoiceIds,
    showGenerateInvoiceModal, setShowGenerateInvoiceModal,
    generating, setGenerating,
    showSyncAddonModal, setShowSyncAddonModal,
    syncingAddon,
    handleSyncAddons,
    fetchInvoices,
    silentRefreshInvoices,
    handleGenerateInvoices,
    handleDeleteInvoice,

    // Payment modal
    showPaymentModal, setShowPaymentModal,
    paymentTarget, setPaymentTarget,
    paymentMethod, setPaymentMethod,
    transferProofFile, setTransferProofFile,
    transferProofPreview, setTransferProofPreview,
    receiptModal, setReceiptModal,
    handlePayInvoice,
    handleTransferProofSelect,
    submitPayment,

    // Bulk pay
    showBulkPayModal, setShowBulkPayModal,
    bulkPayMethod, setBulkPayMethod,
    bulkPayProof, setBulkPayProof,
    bulkPayLoading, setBulkPayLoading,
    submitBulkPay,
    handleQuickPayCash,

    // Discount
    showDiscountModal, setShowDiscountModal,
    discountTarget, setDiscountTarget,
    discountReason, setDiscountReason,
    openDiscountModal,
    submitDiscount,

    // Edit payment method
    editPayMethodModal, setEditPayMethodModal,
    editPayMethodValue, setEditPayMethodValue,
    editPayMethodLoading, setEditPayMethodLoading,
    handleEditPaymentMethod,

    // Cancel invoice
    cancelInvoiceTarget, setCancelInvoiceTarget,
    cancelInvoiceReason, setCancelInvoiceReason,
    cancelInvoiceLoading, setCancelInvoiceLoading,
    submitCancelInvoice,

    // Settlement
    settlementDate, setSettlementDate,
    settlementData, setSettlementData,
    settlementLoading, setSettlementLoading,
    settlementSearch, setSettlementSearch,
    settlementMode, setSettlementMode,
    settlementDateFrom, setSettlementDateFrom,
    settlementDateTo, setSettlementDateTo,
    settlementFilterCollector, setSettlementFilterCollector,
    settlementRangeData, setSettlementRangeData,
    settlementRangeLoading, setSettlementRangeLoading,
    settlementDetail, setSettlementDetail,
    showSettlementDetail, setShowSettlementDetail,
    settlementConfirmLoading, setSettlementConfirmLoading,
    fetchSettlements,
    fetchSettlementRange,
    fetchSettlementDetail,
    confirmSettlement,
    unconfirmSettlement,
    submitCancelInvoice,

    // IP Pools
    ipPools, setIpPools,
    showAddPoolModal, setShowAddPoolModal,
    showEditPoolModal, setShowEditPoolModal,
    newPool, setNewPool,
    editingPool, setEditingPool,
    editPoolName, setEditPoolName,
    handleCreatePool,
    prepareEditPool,
    handleEditPoolSubmit,
    handleDeletePool,

    // Payment proofs
    paymentProofs, setPaymentProofs,
    proofsFilter, setProofsFilter,
    proofsSearch, setProofsSearch,
    proofsVisibleCount, setProofsVisibleCount,
    showProofImageModal, setShowProofImageModal,
    proofImageData, setProofImageData,
    proofImageLoading, setProofImageLoading,
    proofVerifyLoading, setProofVerifyLoading,
    showRejectModal, setShowRejectModal,
    fetchPaymentProofs,
    handleViewProofImage,
    handleVerifyProof,

    // Payment gateway
    showPGModal, setShowPGModal,
    pgInvoice, setPgInvoice,
    paymentGatewayConfig, setPaymentGatewayConfig,
    paymentLoading, setPaymentLoading,
    paymentResult, setPaymentResult,
    showPGSettingsModal, setShowPGSettingsModal,
    pgSettings, setPgSettings,
    fetchPGConfig,
    handleOpenPGModal,
    handleCreatePayment,
    handleSavePGSettings,

    // Export
    exportExcel,
    exportPDF,
  }
}
