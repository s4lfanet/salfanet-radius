"use client"
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Loader2, Trash2, Ticket, Printer, Check, Download, Upload, FileSpreadsheet, MessageCircle, Wifi, Pencil } from "lucide-react"
import { renderVoucherTemplate, getPrintableHtml } from '@/lib/utils/templateRenderer'
import { Switch } from "@/components/ui/switch"
import { useTranslation } from '@/hooks/useTranslation'
import { useSSE } from '@/hooks/useSSE'

interface Voucher {
  id: string; code: string; password: string | null; batchCode: string | null;
  status: 'WAITING' | 'ACTIVE' | 'EXPIRED'; voucherType: string; codeType: string;
  firstLoginAt: string | null; expiresAt: string | null; lastUsedBy: string | null; createdAt: string;
  profile: { name: string; sellingPrice: number; validityValue: number; validityUnit: string; usageQuota: number | null; usageDuration: number | null };
  router?: { id: string; name: string; shortname: string } | null;
  agent?: { id: string; name: string; phone: string } | null;
}
interface Profile { id: string; name: string; sellingPrice: number }
interface RouterItem { id: string; name: string; shortname: string; nasname: string }
interface Agent { id: string; name: string; phone: string }

export default function HotspotVoucherPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [routers, setRouters] = useState<RouterItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [batches, setBatches] = useState<string[]>([])
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genOverlay, setGenOverlay] = useState<{
    open: boolean; current: number; total: number;
    phase: '' | 'generating' | 'done' | 'error';
    batchCode: string; count: number; errorMsg: string;
  }>({ open: false, current: 0, total: 0, phase: '', batchCode: '', count: 0, errorMsg: '' })
  const [deleteBatchCode, setDeleteBatchCode] = useState<string | null>(null)
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([])
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [deletingVouchers, setDeletingVouchers] = useState(false)
  const [isWhatsAppDialogOpen, setIsWhatsAppDialogOpen] = useState(false)
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [filterProfile, setFilterProfile] = useState("")
  const [filterBatch, setFilterBatch] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterRouter, setFilterRouter] = useState("")
  const [filterAgent, setFilterAgent] = useState("")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editTargetIds, setEditTargetIds] = useState<string[]>([])
  const [editMode, setEditMode] = useState<'single' | 'batch'>('single')
  const [editForm, setEditForm] = useState({ profileId: '', routerId: '', agentId: '', clearAgent: false, clearRouter: false })
  const [editSaving, setEditSaving] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importProfileId, setImportProfileId] = useState('')
  const [importBatchCode, setImportBatchCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [formData, setFormData] = useState({ quantity: "", profileId: "", routerId: "", agentId: "", codeLength: "6", prefix: "", voucherType: "same", codeType: "alpha-upper", lockMac: false })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalVouchers, setTotalVouchers] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  const [stats, setStats] = useState({ total: 0, waiting: 0, active: 0, expired: 0, totalValue: 0 })
  const [isSSEConnected, setIsSSEConnected] = useState(false)
  const [companyName, setCompanyName] = useState('ISP')
  const [deleteOverlay, setDeleteOverlay] = useState<{
    open: boolean; phase: '' | 'deleting' | 'done' | 'error';
    count: number; label: string; errorMsg: string;
  }>({ open: false, phase: '', count: 0, label: '', errorMsg: '' })
  
  // SSE Handler for real-time updates
  const handleSSEMessage = useCallback((event: string, data: any) => {
    if (event === 'voucher-stats') {
      console.log('[SSE] Stats update received:', data.stats)
      setStats(data.stats)
      
      // Show notification for changes
      if (data.changes.activated > 0 || data.changes.expired > 0) {
        const message = []
        if (data.changes.activated > 0) message.push(`${data.changes.activated} activated`)
        if (data.changes.expired > 0) message.push(`${data.changes.expired} expired`)
        console.log(`[SSE] Voucher changes: ${message.join(', ')}`)
      }
    } else if (event === 'voucher-changed') {
      console.log('[SSE] Voucher list changed, refreshing...')
      loadVouchers()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Setup SSE connection
  useSSE('/api/sse/voucher-updates', handleSSEMessage, {
    onConnected: () => {
      console.log('[SSE] Connected to real-time updates')
      setIsSSEConnected(true)
    },
    onError: () => {
      setIsSSEConnected(false)
    },
    onReconnecting: () => {
      console.log('[SSE] Reconnecting...')
      setIsSSEConnected(false)
    },
  })

  // Format datetime as-is (already in server local time from API)
  // Backend stores in server timezone (Asia/Jakarta WIB)
  // Display without any timezone conversion
  const formatLocal = (date: Date | string | null, formatStr: string) => {
    if (!date) return '-'
    try {
      // Parse ISO string but format in local system time (which should match server)
      const d = typeof date === 'string' ? new Date(date) : date
      // Use UTC formatting to prevent browser timezone conversion
      // Since backend already sends in server timezone
      return format(d, formatStr)
    } catch {
      return '-'
    }
  }

  // Calculate time left in UTC
  const timeLeft = (expiresAt: Date | string | null) => {
    if (!expiresAt) return '-'
    try {
      const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
      const now = new Date()
      const diff = Math.max(0, Math.floor((d.getTime() - now.getTime()) / 1000))
      if (diff === 0) return t('hotspot.expired')
      const days = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      if (days > 0) return `${days}d ${h}h left`
      if (h > 0) return `${h}h ${m}m left`
      if (m > 0) return `${m}m ${s}s left`
      return `${s}s left`
    } catch {
      return '-'
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProfiles(); loadRouters(); loadAgents(); loadVouchers(); loadTemplates();
    fetch('/api/public/company').then(r => r.json()).then(d => { if (d.success && d.company?.name) setCompanyName(d.company.name); }).catch(() => {});
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentPage(1); loadVouchers(); }, [filterProfile, filterBatch, filterStatus, filterRouter, filterAgent])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadVouchers(); }, [currentPage, pageSize])
  
  // Auto-refresh voucher list every 30 seconds to sync with cron updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadVouchers()
    }, 30000) // 30 seconds
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProfile, filterBatch, filterStatus, filterRouter, filterAgent, currentPage, pageSize])

  const loadProfiles = async () => { try { const res = await fetch('/api/hotspot/profiles'); const data = await res.json(); setProfiles(data.profiles || []); } catch (e) { console.error(e); } }
  const loadRouters = async () => { try { const res = await fetch('/api/network/routers'); const data = await res.json(); setRouters(data.routers || []); } catch (e) { console.error(e); } }
  const loadAgents = async () => { try { const res = await fetch('/api/hotspot/agents'); const data = await res.json(); setAgents(data.agents || []); } catch (e) { console.error(e); } }
  const loadTemplates = async () => { try { const res = await fetch('/api/voucher-templates'); if (res.ok) { const data = await res.json(); setTemplates(data.filter((t: any) => t.isActive)); const def = data.find((t: any) => t.isDefault); if (def) setSelectedTemplate(def.id); } } catch (e) { console.error(e); } }
  const loadVouchers = async () => {
    try {
      const params = new URLSearchParams();
      if (filterProfile && filterProfile !== 'all') params.append('profileId', filterProfile);
      if (filterBatch && filterBatch !== 'all') params.append('batchCode', filterBatch);
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);
      if (filterRouter && filterRouter !== 'all') params.append('routerId', filterRouter);
      if (filterAgent && filterAgent !== 'all') params.append('agentId', filterAgent);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      const res = await fetch(`/api/hotspot/voucher?${params}`);
      const data = await res.json();
      setVouchers(data.vouchers || []); 
      setBatches(data.batches || []);
      setTotalPages(data.totalPages || 1);
      setTotalVouchers(data.total || 0);
      setStats(data.stats || { total: 0, waiting: 0, active: 0, expired: 0, totalValue: 0 });
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  const CHUNK_SIZE = 2000;
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalQty = parseInt(formData.quantity);
    if (!totalQty || totalQty < 1) return;

    // Close form dialog, show progress overlay immediately
    setIsGenerateDialogOpen(false);
    setGenerating(true);
    setGenOverlay({ open: true, current: 0, total: totalQty, phase: 'generating', batchCode: '', count: 0, errorMsg: '' });

    // Generate a shared batchCode prefix for all chunks
    const sharedBatch = `BATCH-${Date.now()}`;
    let totalGenerated = 0;
    let lastBatchCode = '';
    let remaining = totalQty;

    try {
      while (remaining > 0) {
        const chunkQty = Math.min(CHUNK_SIZE, remaining);
        const res = await fetch('/api/hotspot/voucher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            quantity: chunkQty,
            codeLength: parseInt(formData.codeLength),
            batchCode: sharedBatch,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setGenOverlay(prev => ({ ...prev, phase: 'error', errorMsg: data.error || t('common.failed') }));
          if (totalGenerated > 0) loadVouchers();
          return;
        }
        totalGenerated += Number(data.count) || 0;
        lastBatchCode = data.batchCode || lastBatchCode;
        remaining -= chunkQty;
        setGenOverlay(prev => ({ ...prev, current: totalGenerated, batchCode: lastBatchCode }));
      }

      setGenOverlay(prev => ({ ...prev, phase: 'done', count: totalGenerated, batchCode: lastBatchCode }));
      setFormData({ quantity: "", profileId: "", routerId: "", agentId: "", codeLength: "6", prefix: "", voucherType: "same", codeType: "alpha-upper", lockMac: false });
      loadVouchers();
      setTimeout(() => setGenOverlay({ open: false, current: 0, total: 0, phase: '', batchCode: '', count: 0, errorMsg: '' }), 3500);
    } catch (err) {
      console.error(err);
      setGenOverlay(prev => ({ ...prev, phase: 'error', errorMsg: t('common.failed') }));
      if (totalGenerated > 0) loadVouchers();
    } finally {
      setGenerating(false);
    }
  }

  const handleDeleteBatch = async () => {
    if (!deleteBatchCode) return;
    const confirmed = await showConfirm(t('hotspot.deleteUnusedFromBatch').replace('{batch}', deleteBatchCode));
    if (!confirmed) { setDeleteBatchCode(null); return; }
    const label = `Batch: ${deleteBatchCode}`;
    setDeleteOverlay({ open: true, phase: 'deleting', count: 0, label, errorMsg: '' });
    try {
      const res = await fetch(`/api/hotspot/voucher?batchCode=${deleteBatchCode}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setDeleteOverlay({ open: true, phase: 'done', count: data.count, label, errorMsg: '' });
        loadVouchers();
        setTimeout(() => setDeleteOverlay({ open: false, phase: '', count: 0, label: '', errorMsg: '' }), 2500);
      } else {
        setDeleteOverlay({ open: true, phase: 'error', count: 0, label, errorMsg: data.error || t('common.failed') });
      }
    } catch (e) { console.error(e); setDeleteOverlay({ open: true, phase: 'error', count: 0, label, errorMsg: t('common.failed') }); } finally { setDeleteBatchCode(null); }
  }

  const handleDeleteVoucher = async (voucherId: string, code: string) => {
    const confirmed = await showConfirm(t('hotspot.deleteCode').replace('{code}', code));
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/hotspot/voucher/${voucherId}`, { method: 'DELETE' });
      const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : {};
      if (res.ok) { await showSuccess(t('common.deleted')); loadVouchers(); }
      else { await showError(data.error); }
    } catch (e) { console.error(e); await showError(t('common.failed')); }
  }

  const handleDeleteSelected = async () => {
    if (selectedVouchers.length === 0) { await showError(t('hotspot.selectVouchersFirst')); return; }
    const confirmed = await showConfirm(t('hotspot.deleteVouchersConfirm').replace('{count}', String(selectedVouchers.length)));
    if (!confirmed) return;
    const label = `${selectedVouchers.length} voucher dipilih`;
    setDeleteOverlay({ open: true, phase: 'deleting', count: selectedVouchers.length, label, errorMsg: '' });
    setDeletingVouchers(true);
    try {
      const res = await fetch('/api/hotspot/voucher/delete-multiple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voucherIds: selectedVouchers }) });
      const data = await res.json();
      if (res.ok) {
        setDeleteOverlay({ open: true, phase: 'done', count: data.deleted, label: '', errorMsg: '' });
        setSelectedVouchers([]);
        loadVouchers();
        setTimeout(() => setDeleteOverlay({ open: false, phase: '', count: 0, label: '', errorMsg: '' }), 2500);
      } else {
        setDeleteOverlay({ open: true, phase: 'error', count: 0, label, errorMsg: data.error || t('common.failed') });
      }
    } catch (e) { console.error(e); setDeleteOverlay({ open: true, phase: 'error', count: 0, label, errorMsg: t('common.failed') }); } finally { setDeletingVouchers(false); }
  }

  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)
  const handleSelectVoucher = (id: string) => { setSelectedVouchers(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); }
  const handleSelectAll = () => { const w = vouchers.filter(v => v.status === 'WAITING').map(v => v.id); setSelectedVouchers(w.length === selectedVouchers.length ? [] : w); }
  const handlePrintSelected = async () => { if (selectedVouchers.length === 0) { await showError(t('hotspot.selectVouchers')); return; } setIsPrintDialogOpen(true); }
  const handleSendWhatsApp = async () => { if (selectedVouchers.length === 0) { await showError(t('hotspot.selectVouchers')); return; } setIsWhatsAppDialogOpen(true); }
  
  const handleWhatsAppSubmit = async () => {
    if (!whatsappPhone) { await showError(t('hotspot.enterPhone')); return; }
    setSendingWhatsApp(true);
    try {
      const vouchersToSend = vouchers.filter(v => selectedVouchers.includes(v.id));
      const res = await fetch('/api/hotspot/voucher/send-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: whatsappPhone, vouchers: vouchersToSend.map(v => ({ code: v.code, profileName: v.profile.name, price: v.profile.sellingPrice, validity: `${v.profile.validityValue} ${v.profile.validityUnit.toLowerCase()}` })) }) });
      const data = await res.json();
      if (data.success) { await showSuccess(t('hotspot.sent')); setIsWhatsAppDialogOpen(false); setWhatsappPhone(''); setSelectedVouchers([]); }
      else { await showError(data.error); }
    } catch (e) { console.error(e); await showError(t('common.failed')); } finally { setSendingWhatsApp(false); }
  }

  const handlePrintBatch = async () => { if (!filterBatch || filterBatch === 'all') { await showError(t('hotspot.filterByBatchFirst')); return; } const bv = vouchers.filter(v => v.batchCode === filterBatch && v.status === 'WAITING').map(v => v.id); setSelectedVouchers(bv); setIsPrintDialogOpen(true); }
  const handlePrint = async () => {
    if (!selectedTemplate) { await showError(t('hotspot.selectTemplate')); return; }
    const template = templates.find(t => t.id === selectedTemplate); if (!template) return;
    const vouchersToPrint = vouchers.filter(v => selectedVouchers.includes(v.id));
    const voucherData = vouchersToPrint.map(v => ({ 
      code: v.code, 
      secret: v.password || v.code, 
      total: v.profile.sellingPrice,
      profile: {
        name: v.profile.name,
        validityValue: v.profile.validityValue,
        validityUnit: v.profile.validityUnit,
        usageQuota: v.profile.usageQuota,
        usageDuration: v.profile.usageDuration
      },
      router: v.router ? { name: v.router.name, shortname: v.router.shortname } : undefined
    }));
    const firstRouter = vouchersToPrint.find(v => v.router)?.router?.name || companyName;
    const rendered = renderVoucherTemplate(template.htmlTemplate, voucherData, { currencyCode: 'Rp', companyName: firstRouter });
    const printHtml = getPrintableHtml(rendered);
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(printHtml); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); }, 500); }
    setIsPrintDialogOpen(false); setSelectedVouchers([]);
  }

  const handleDownloadTemplate = async () => { try { const res = await fetch('/api/hotspot/voucher/bulk?type=template'); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'voucher-template.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); } catch (e) { console.error(e); await showError(t('common.failed')); } }
  const handleExportData = async () => { try { const res = await fetch('/api/hotspot/voucher/bulk?type=export'); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `vouchers-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); } catch (e) { console.error(e); await showError(t('common.failed')); } }
  
  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'excel');
      if (filterProfile && filterProfile !== 'all') params.set('profileId', filterProfile);
      if (filterBatch && filterBatch !== 'all') params.set('batchCode', filterBatch);
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterRouter && filterRouter !== 'all') params.set('routerId', filterRouter);
      if (filterAgent && filterAgent !== 'all') params.set('agentId', filterAgent);
      const res = await fetch(`/api/hotspot/voucher/export?${params}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Vouchers-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (e) { console.error(e); await showError(t('hotspot.exportFailed')); }
  };

  const handleExportPDFList = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'pdf');
      if (filterProfile && filterProfile !== 'all') params.set('profileId', filterProfile);
      if (filterBatch && filterBatch !== 'all') params.set('batchCode', filterBatch);
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/hotspot/voucher/export?${params}`);
      const data = await res.json();
      if (data.pdfData) {
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14); doc.text(data.pdfData.title, 14, 15);
        doc.setFontSize(8); doc.text(`Generated: ${data.pdfData.generatedAt}`, 14, 21);
        autoTable(doc, { head: [data.pdfData.headers], body: data.pdfData.rows, startY: 26, styles: { fontSize: 7 }, headStyles: { fillColor: [13, 148, 136] } });
        if (data.pdfData.summary) {
          const finalY = (doc as any).lastAutoTable.finalY + 8;
          doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          data.pdfData.summary.forEach((s: any, i: number) => { doc.text(`${s.label}: ${s.value}`, 14, finalY + (i * 5)); });
        }
        doc.save(`Vouchers-${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (e) { console.error(e); await showError(t('hotspot.pdfExportFailed')); }
  };

  const handleExportVoucherCards = async () => {
    const vouchersToExport = selectedVouchers.length > 0 
      ? vouchers.filter(v => selectedVouchers.includes(v.id))
      : vouchers.filter(v => v.status === 'WAITING');
    
    if (vouchersToExport.length === 0) { await showError(t('hotspot.noVouchersToExport')); return; }
    
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF();
    
    // 4 cards per page (2x2)
    const cardWidth = 85;
    const cardHeight = 55;
    const margin = 12;
    const cardsPerRow = 2;
    const cardsPerPage = 4;
    
    vouchersToExport.forEach((v, idx) => {
      if (idx > 0 && idx % cardsPerPage === 0) doc.addPage();
      
      const pageIdx = idx % cardsPerPage;
      const row = Math.floor(pageIdx / cardsPerRow);
      const col = pageIdx % cardsPerRow;
      const x = margin + col * (cardWidth + margin);
      const y = margin + row * (cardHeight + margin);
      
      // Card border
      doc.setDrawColor(200); doc.setLineWidth(0.5);
      doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'S');
      
      // Title
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text('HOTSPOT VOUCHER', x + cardWidth/2, y + 8, { align: 'center' });
      
      // Code
      doc.setFontSize(16); doc.setFont('courier', 'bold');
      doc.text(v.code, x + cardWidth/2, y + 22, { align: 'center' });
      
      // Password if different
      if (v.password && v.voucherType === 'different') {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(`Password: ${v.password}`, x + cardWidth/2, y + 28, { align: 'center' });
      }
      
      // Profile & price
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(v.profile.name, x + cardWidth/2, y + 36, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(v.profile.sellingPrice), x + cardWidth/2, y + 43, { align: 'center' });
      
      // Validity
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(`Valid: ${v.profile.validityValue} ${v.profile.validityUnit.toLowerCase()}`, x + cardWidth/2, y + 50, { align: 'center' });
    });
    
    doc.save(`Voucher-Cards-${new Date().toISOString().split('T')[0]}.pdf`);
    setSelectedVouchers([]);
  };

  const handleImport = async () => {
    if (!importFile || !importProfileId) { await showError(t('pppoe.selectFileAndProfile')); return; }
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData(); fd.append('file', importFile); fd.append('profileId', importProfileId); if (importBatchCode) fd.append('batchCode', importBatchCode);
      const res = await fetch('/api/hotspot/voucher/bulk', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) { setImportResult(data.results); loadVouchers(); if (data.results.failed === 0) setTimeout(() => { setIsImportDialogOpen(false); setImportFile(null); setImportProfileId(''); setImportBatchCode(''); setImportResult(null); }, 3000); }
      else { await showError(data.error); }
    } catch (e) { console.error(e); await showError(t('common.failed')); } finally { setImporting(false); }
  }

  const openEditSingle = (v: Voucher) => {
    const matchedProfile = profiles.find(p => p.name === v.profile.name)
    setEditTargetIds([v.id])
    setEditMode('single')
    setEditForm({
      profileId: matchedProfile?.id || '',
      routerId: v.router?.id || '',
      agentId: v.agent?.id || '',
      clearAgent: false,
      clearRouter: false,
    })
    setIsEditDialogOpen(true)
  }

  const openEditBatch = () => {
    setEditTargetIds([...selectedVouchers])
    setEditMode('batch')
    setEditForm({ profileId: '', routerId: '', agentId: '', clearAgent: false, clearRouter: false })
    setIsEditDialogOpen(true)
  }

  const handleEditSave = async () => {
    if (editTargetIds.length === 0) return
    setEditSaving(true)
    try {
      const body: any = { ids: editTargetIds }
      if (editForm.profileId) body.profileId = editForm.profileId
      if (editForm.routerId) body.routerId = editForm.routerId
      else if (editForm.clearRouter) body.clearRouter = true
      if (editForm.agentId) body.agentId = editForm.agentId
      else if (editForm.clearAgent) body.clearAgent = true

      if (!body.profileId && !body.routerId && !body.agentId && !body.clearRouter && !body.clearAgent) {
        await showError('Pilih setidaknya satu field untuk diubah')
        setEditSaving(false)
        return
      }
      const res = await fetch('/api/hotspot/voucher', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) {
        await showSuccess(`${data.updated} voucher berhasil diperbarui`)
        setIsEditDialogOpen(false)
        setSelectedVouchers([])
        loadVouchers()
      } else {
        await showError(data.error)
      }
    } catch (e) {
      console.error(e)
      await showError('Terjadi kesalahan')
    } finally {
      setEditSaving(false)
    }
  }

  const selectedProfile = profiles.find(p => p.id === formData.profileId);
  if (loading) { return <div className="flex items-center justify-center min-h-[60vh]"><div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div><div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div></div><Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" /></div>; }
  // Stats are now loaded from API

  return (
    <div className="bg-background relative overflow-hidden">
      {/* ─── Delete Progress Overlay ─── */}
      {deleteOverlay.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-card border-2 border-red-500/60 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-[0_0_80px_rgba(239,68,68,0.4)]">
            <div className="flex justify-center mb-5">
              {deleteOverlay.phase === 'done' ? (
                <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-400" />
                </div>
              ) : deleteOverlay.phase === 'error' ? (
                <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center">
                  <Trash2 className="h-8 w-8 text-red-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center animate-pulse">
                  <Loader2 className="h-8 w-8 text-red-400 animate-spin" />
                </div>
              )}
            </div>
            <h3 className="text-center text-base font-bold text-foreground mb-1">
              {deleteOverlay.phase === 'done'  ? 'Voucher Berhasil Dihapus!' :
               deleteOverlay.phase === 'error' ? 'Hapus Gagal' :
               'Sedang Menghapus Voucher...'}
            </h3>
            {deleteOverlay.phase === 'deleting' && (
              <>
                <p className="text-center text-xs text-muted-foreground mt-1">Mohon jangan tutup halaman ini</p>
                {deleteOverlay.label && <p className="text-center text-xs text-muted-foreground mt-2 font-medium">{deleteOverlay.label}</p>}
              </>
            )}
            {deleteOverlay.phase === 'done' && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-sm font-semibold text-green-400">{deleteOverlay.count.toLocaleString()} voucher berhasil dihapus</p>
                <p className="text-xs text-muted-foreground mt-0.5">Halaman akan diperbarui otomatis...</p>
              </div>
            )}
            {deleteOverlay.phase === 'error' && (
              <div className="mt-4 space-y-3">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                  <p className="text-sm text-red-400">{deleteOverlay.errorMsg}</p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setDeleteOverlay({ open: false, phase: '', count: 0, label: '', errorMsg: '' })}>Tutup</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ─── Generate Progress Overlay ─── */}
      {genOverlay.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-card border-2 border-[#bc13fe]/60 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-[0_0_80px_rgba(188,19,254,0.5)]">
            {/* Icon */}
            <div className="flex justify-center mb-5">
              {genOverlay.phase === 'done' ? (
                <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-400" />
                </div>
              ) : genOverlay.phase === 'error' ? (
                <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center">
                  <Ticket className="h-8 w-8 text-red-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#bc13fe]/20 border-2 border-[#bc13fe] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-[#bc13fe] animate-spin" />
                </div>
              )}
            </div>
            {/* Title */}
            <h3 className="text-center text-base font-bold text-foreground mb-1">
              {genOverlay.phase === 'done'  ? 'Voucher Berhasil Dibuat!' :
               genOverlay.phase === 'error' ? 'Generate Gagal' :
               'Sedang Generate Voucher...'}
            </h3>
            {genOverlay.phase === 'generating' && (
              <p className="text-center text-xs text-muted-foreground mb-5">Mohon jangan tutup halaman ini</p>
            )}
            {/* Progress bar */}
            {genOverlay.phase !== 'error' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Voucher dibuat</span>
                  <span className="font-medium text-foreground">{genOverlay.current.toLocaleString()} / {genOverlay.total.toLocaleString()}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="h-3 rounded-full transition-all duration-500 bg-gradient-to-r from-[#bc13fe] via-[#ff44cc] to-[#00f7ff]"
                    style={{ width: `${genOverlay.total > 0 ? Math.round((genOverlay.current / genOverlay.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-center text-sm font-bold text-[#00f7ff] mt-2">
                  {genOverlay.total > 0 ? Math.round((genOverlay.current / genOverlay.total) * 100) : 0}%
                </p>
              </div>
            )}
            {/* Success info */}
            {genOverlay.phase === 'done' && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-sm font-semibold text-green-400">{genOverlay.count.toLocaleString()} voucher berhasil dibuat</p>
                {genOverlay.batchCode && <p className="text-xs text-muted-foreground mt-1">Batch: {genOverlay.batchCode}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">Halaman akan diperbarui otomatis...</p>
              </div>
            )}
            {/* Error info */}
            {genOverlay.phase === 'error' && (
              <div className="mt-4 space-y-3">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                  <p className="text-sm text-red-400">{genOverlay.errorMsg}</p>
                  {genOverlay.current > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{genOverlay.current.toLocaleString()} voucher sudah berhasil sebelum error</p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setGenOverlay({ open: false, current: 0, total: 0, phase: '', batchCode: '', count: 0, errorMsg: '' })}>
                  Tutup
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('hotspot.title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('hotspot.generateVoucher')}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-7 text-[10px] px-2"><Download className="h-3 w-3 mr-1" />{t('nav.template')}</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-7 text-[10px] px-2 border-success text-success hover:bg-success/10"><Download className="h-3 w-3 mr-1" />Excel</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDFList} className="h-7 text-[10px] px-2 border-destructive text-destructive hover:bg-destructive/10"><Download className="h-3 w-3 mr-1" />PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportVoucherCards} className="h-7 text-[10px] px-2 border-primary text-primary hover:bg-primary/10"><Printer className="h-3 w-3 mr-1" />Cards</Button>
          <Button variant="outline" size="sm" onClick={() => setIsImportDialogOpen(true)} className="h-7 text-[10px] px-2"><Upload className="h-3 w-3 mr-1" />{t('common.import')}</Button>
          <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen} modal={false}>
            <DialogTrigger asChild><Button size="sm" className="h-7 text-[10px] px-2"><Plus className="h-3 w-3 mr-1" />{t('hotspot.generateVoucher')}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader className="border-b pb-3">
                <DialogTitle className="text-base font-semibold">{t('hotspot.generateVoucher')}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">{t('hotspot.bulkGenerate')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleGenerate} className="space-y-4 pt-2">
                {/* Profile & Quantity - Most Important */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div>
                    <Label className="text-sm font-medium text-foreground">{t('hotspot.profile')} *</Label>
                    <Select value={formData.profileId} onValueChange={(v) => setFormData({ ...formData, profileId: v })} required>
                      <SelectTrigger className="h-10 text-sm mt-1.5">
                        <SelectValue placeholder={t('common.select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-sm">
                            <div className="flex items-center justify-between w-full">
                              <span>{p.name}</span>
                              <span className="ml-2 text-primary font-medium">{formatCurrency(p.sellingPrice)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground">{t('common.quantity')} *</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="25000" 
                      value={formData.quantity} 
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} 
                      className="h-10 text-sm mt-1.5" 
                      placeholder="Max 25,000"
                      required 
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('hotspot.maxPerBatch')}</p>
                  </div>
                </div>

                {/* Total Price Display */}
                {selectedProfile && formData.quantity && (
                  <div className="p-4 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-lg text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs opacity-90">{t('hotspot.totalValue')}</p>
                        <p className="text-lg sm:text-2xl font-bold">{formatCurrency(selectedProfile.sellingPrice * parseInt(formData.quantity || '0'))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs opacity-90">{t('hotspot.items')}</p>
                        <p className="text-xl font-semibold">{parseInt(formData.quantity || '0').toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Code Configuration */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-primary" />
                    {t('hotspot.codeConfiguration')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('common.type')}</Label>
                      <Select value={formData.voucherType} onValueChange={(v) => setFormData({ ...formData, voucherType: v })}>
                        <SelectTrigger className="h-9 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same">{t('hotspot.userPassSame')}</SelectItem>
                          <SelectItem value="different">{t('hotspot.userPassDiff')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('hotspot.code')} {t('common.type')}</Label>
                      <Select value={formData.codeType} onValueChange={(v) => setFormData({ ...formData, codeType: v })}>
                        <SelectTrigger className="h-9 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alpha-upper">{t('hotspot.uppercase')}</SelectItem>
                          <SelectItem value="alpha-lower">{t('hotspot.lowercase')}</SelectItem>
                          <SelectItem value="numeric">{t('hotspot.numeric')}</SelectItem>
                          <SelectItem value="alphanumeric-upper">{t('hotspot.alphaNum')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('hotspot.prefixOptional')}</Label>
                      <Input 
                        value={formData.prefix} 
                        onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toUpperCase() })} 
                        maxLength={5} 
                        className="h-9 text-sm mt-1" 
                        placeholder="e.g., HS-" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('hotspot.lengthLabel')}</Label>
                      <Input 
                        type="number" 
                        min="4" 
                        max="10" 
                        value={formData.codeLength} 
                        onChange={(e) => setFormData({ ...formData, codeLength: e.target.value })} 
                        className="h-9 text-sm mt-1" 
                        required 
                      />
                    </div>
                  </div>
                </div>

                {/* Assignment & Options */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">{t('hotspot.assignmentOptions')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('nav.router')}</Label>
                      <Select value={formData.routerId} onValueChange={(v) => setFormData({ ...formData, routerId: v === 'all' ? '' : v })}>
                        <SelectTrigger className="h-9 text-sm mt-1">
                          <SelectValue placeholder={t('common.all')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('hotspot.allRoutersGlobal')}</SelectItem>
                          {routers.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('nav.agent')}</Label>
                      <Select value={formData.agentId} onValueChange={(v) => setFormData({ ...formData, agentId: v === 'none' ? '' : v })}>
                        <SelectTrigger className="h-9 text-sm mt-1">
                          <SelectValue placeholder={t('hotspot.noAgent')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('hotspot.noAgent')}</SelectItem>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                    <div>
                      <Label className="text-sm font-medium">{t('hotspot.lockMacAddress')}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('hotspot.lockMacDesc')}</p>
                    </div>
                    <Switch 
                      checked={formData.lockMac} 
                      onCheckedChange={(c) => setFormData({ ...formData, lockMac: c })} 
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsGenerateDialogOpen(false)} 
                    className="h-9 text-sm"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button 
                    type="submit" 
                    size="sm" 
                    disabled={generating} 
                    className="h-9 text-sm px-6"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        {t('hotspot.generateVoucher')}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all relative">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('common.total')}</p><p className="text-lg sm:text-2xl font-bold text-foreground drop-shadow-none mt-1">{stats.total}</p></div><Ticket className="h-6 w-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" /></div>
          {isSSEConnected && <div className="absolute top-2 right-2" title="Real-time updates active"><Wifi className="h-3 w-3 text-green-400 animate-pulse" /></div>}
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('hotspot.waiting')}</p><p className="text-lg sm:text-2xl font-bold text-foreground drop-shadow-none mt-1">{stats.waiting}</p></div><Ticket className="h-6 w-6 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" /></div>
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('hotspot.active')}</p><p className="text-lg sm:text-2xl font-bold text-foreground drop-shadow-none mt-1">{stats.active}</p></div><Ticket className="h-6 w-6 text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]" /></div>
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('hotspot.expired')}</p><p className="text-lg sm:text-2xl font-bold text-foreground drop-shadow-none mt-1">{stats.expired}</p></div><Ticket className="h-6 w-6 text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]" /></div>
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between"><div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('common.total')} {t('common.price')}</p><p className="text-xl font-bold text-foreground drop-shadow-none mt-1">{formatCurrency(stats.totalValue)}</p></div><Ticket className="h-6 w-6 text-[#ff44cc] drop-shadow-[0_0_15px_rgba(255,68,204,0.6)]" /></div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)} className="px-2 py-1.5 text-xs bg-muted border border-border rounded"><option value="">{t('common.all')} {t('nav.profiles')}</option><option value="all">{t('common.all')} {t('nav.profiles')}</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={filterRouter} onChange={(e) => setFilterRouter(e.target.value)} className="px-2 py-1.5 text-xs bg-muted border border-border rounded"><option value="">{t('common.all')} {t('nav.routers')}</option><option value="all">{t('common.all')} {t('nav.routers')}</option>{routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="px-2 py-1.5 text-xs bg-muted border border-border rounded"><option value="">{t('common.all')} {t('nav.agent')}</option><option value="all">{t('common.all')} {t('nav.agent')}</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} className="px-2 py-1.5 text-xs bg-muted border border-border rounded"><option value="">{t('common.all')} Batch</option><option value="all">{t('common.all')} Batch</option>{batches.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 text-xs bg-muted border border-border rounded"><option value="">{t('common.all')} {t('common.status')}</option><option value="all">{t('common.all')} {t('common.status')}</option><option value="WAITING">{t('hotspot.waiting')}</option><option value="ACTIVE">{t('hotspot.active')}</option><option value="EXPIRED">{t('hotspot.expired')}</option></select>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium">{t('nav.voucher')} ({vouchers.length})</span>
          <div className="flex gap-1 flex-wrap">
            {selectedVouchers.length > 0 && (
              <>
                <button onClick={handleDeleteSelected} disabled={deletingVouchers} className="px-2 py-1 text-[10px] bg-destructive text-destructive-foreground rounded flex items-center gap-0.5">{deletingVouchers ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}{t('common.delete')} ({selectedVouchers.length})</button>
                <button onClick={openEditBatch} className="px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded flex items-center gap-0.5"><Pencil className="h-2.5 w-2.5" />Edit ({selectedVouchers.length})</button>
                <button onClick={handleSendWhatsApp} className="px-2 py-1 text-[10px] bg-success text-success-foreground rounded flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />WA ({selectedVouchers.length})</button>
                <button onClick={handlePrintSelected} className="px-2 py-1 text-[10px] bg-primary text-white rounded flex items-center gap-0.5"><Printer className="h-2.5 w-2.5" />{t('common.print')} ({selectedVouchers.length})</button>
              </>
            )}
            {filterBatch && filterBatch !== 'all' && <button onClick={handlePrintBatch} className="px-2 py-1 text-[10px] bg-muted-foreground text-background rounded flex items-center gap-0.5"><Printer className="h-2.5 w-2.5" />Batch</button>}
            {stats.expired > 0 && <button onClick={async () => { const c = await showConfirm(`${t('common.delete')} ${t('hotspot.expired')}?`); if (!c) return; setDeleteOverlay({ open: true, phase: 'deleting', count: stats.expired, label: `${stats.expired} voucher expired`, errorMsg: '' }); const res = await fetch('/api/hotspot/voucher/delete-expired', { method: 'POST' }); const data = await res.json(); if (res.ok) { setDeleteOverlay({ open: true, phase: 'done', count: data.count, label: '', errorMsg: '' }); loadVouchers(); setTimeout(() => setDeleteOverlay({ open: false, phase: '', count: 0, label: '', errorMsg: '' }), 2500); } else { setDeleteOverlay({ open: true, phase: 'error', count: 0, label: '', errorMsg: data.error || t('common.failed') }); } }} className="px-2 py-1 text-[10px] bg-destructive text-destructive-foreground rounded flex items-center gap-0.5"><Trash2 className="h-2.5 w-2.5" />{t('hotspot.expired')} ({stats.expired})</button>}
            {filterBatch && filterBatch !== 'all' && <button onClick={() => setDeleteBatchCode(filterBatch)} className="px-2 py-1 text-[10px] bg-destructive text-destructive-foreground rounded flex items-center gap-0.5"><Trash2 className="h-2.5 w-2.5" />{t('common.delete')} Batch</button>}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3 p-3">
          {vouchers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">{t('table.noResults')}</div>
          ) : (
            vouchers.map((v) => (
              <div key={v.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3 space-y-2">
                {/* Header: Checkbox + Code + Status + Delete */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {v.status === 'WAITING' && (
                      <input type="checkbox" checked={selectedVouchers.includes(v.id)} onChange={() => handleSelectVoucher(v.id)} className="rounded border-border w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sm text-foreground">{v.code}</span>
                      {v.password && v.voucherType === 'different' && (
                        <div className="text-[10px] text-muted-foreground">P: {v.password}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {v.status === 'WAITING' && <Badge className="text-[10px] px-1.5 py-0.5 bg-warning/10 text-warning">{t('hotspot.waiting')}</Badge>}
                    {v.status === 'ACTIVE' && <Badge className="text-[10px] px-1.5 py-0.5 bg-success/10 text-success">{t('hotspot.active')}</Badge>}
                    {v.status === 'EXPIRED' && <Badge className="text-[10px] px-1.5 py-0.5 bg-destructive/10 text-destructive">{t('hotspot.expired')}</Badge>}
                    <button onClick={() => openEditSingle(v)} className="p-2 text-primary hover:bg-primary/10 rounded"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDeleteVoucher(v.id, v.code)} className="p-2 text-destructive hover:bg-destructive/10 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{t('hotspot.profile')}</span>
                    <span className="text-sm text-foreground font-medium truncate">{v.profile.name}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{t('hotspot.price')}</span>
                    <span className="text-sm text-foreground font-medium">{formatCurrency(v.profile.sellingPrice)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{t('nav.router')}</span>
                    <span>{v.router ? <Badge variant="outline" className="text-[9px] px-1 mt-0.5">{v.router.shortname || v.router.name}</Badge> : <span className="text-xs text-muted-foreground">Global</span>}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{t('nav.agent')}</span>
                    <span>{v.agent ? <Badge variant="secondary" className="text-[9px] px-1 mt-0.5">{v.agent.name}</Badge> : <span className="text-xs text-muted-foreground">-</span>}</span>
                  </div>
                  {v.batchCode && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">Batch</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{v.batchCode}</span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{t('hotspot.generated')}</span>
                    <span className="text-[11px]">{formatLocal(v.createdAt, 'dd/MM/yy HH:mm')}</span>
                  </div>
                  {v.firstLoginAt && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">{t('hotspot.firstLogin')}</span>
                      <span className="text-[11px]">{formatLocal(v.firstLoginAt, 'dd/MM/yy HH:mm')}</span>
                    </div>
                  )}
                  {v.expiresAt && (
                    <div className="flex flex-col col-span-2">
                      <span className="text-[10px] text-muted-foreground">{t('hotspot.validUntil')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]">{formatLocal(v.expiresAt, 'dd/MM/yy HH:mm')}</span>
                        {v.status === 'ACTIVE' && <span className="text-primary font-medium text-[10px]">{timeLeft(v.expiresAt)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 py-2"><input type="checkbox" checked={selectedVouchers.length > 0 && selectedVouchers.length === vouchers.filter(v => v.status === 'WAITING').length} onChange={handleSelectAll} className="rounded border-border w-3 h-3" /></TableHead>
                <TableHead className="text-[10px] py-2">{t('hotspot.code')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden sm:table-cell">{t('hotspot.profile')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden md:table-cell">{t('nav.router')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden lg:table-cell">{t('nav.agent')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden xl:table-cell">{t('hotspot.batch')}</TableHead>
                <TableHead className="text-[10px] py-2">{t('hotspot.price')}</TableHead>
                <TableHead className="text-[10px] py-2">{t('common.status')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden lg:table-cell">{t('hotspot.generated')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden sm:table-cell">{t('hotspot.firstLogin')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden md:table-cell">{t('hotspot.validUntil')}</TableHead>
                <TableHead className="text-[10px] py-2 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground text-xs">{t('table.noResults')}</TableCell></TableRow>
              ) : (
                vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="py-1.5">{v.status === 'WAITING' && <input type="checkbox" checked={selectedVouchers.includes(v.id)} onChange={() => handleSelectVoucher(v.id)} className="rounded border-border w-3 h-3" />}</TableCell>
                    <TableCell className="py-1.5 font-mono font-bold text-xs">{v.code}{v.password && v.voucherType === 'different' && <div className="text-[9px] text-muted-foreground font-normal">P: {v.password}</div>}</TableCell>
                    <TableCell className="py-1.5 text-xs hidden sm:table-cell">{v.profile.name}</TableCell>
                    <TableCell className="py-1.5 hidden md:table-cell">{v.router ? <Badge variant="outline" className="text-[9px] px-1">{v.router.shortname || v.router.name}</Badge> : <span className="text-[9px] text-muted-foreground">Global</span>}</TableCell>
                    <TableCell className="py-1.5 hidden lg:table-cell">{v.agent ? <Badge variant="secondary" className="text-[9px] px-1">{v.agent.name}</Badge> : <span className="text-[9px] text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="py-1.5 hidden xl:table-cell"><span className="text-[9px] font-mono text-muted-foreground">{v.batchCode || 'N/A'}</span></TableCell>
                    <TableCell className="py-1.5 text-xs font-medium">{formatCurrency(v.profile.sellingPrice)}</TableCell>
                    <TableCell className="py-1.5">
                      {v.status === 'WAITING' && <Badge className="text-[9px] px-1 bg-warning/10 text-warning">{t('hotspot.waiting')}</Badge>}
                      {v.status === 'ACTIVE' && <Badge className="text-[9px] px-1 bg-success/10 text-success">{t('hotspot.active')}</Badge>}
                      {v.status === 'EXPIRED' && <Badge className="text-[9px] px-1 bg-destructive/10 text-destructive">{t('hotspot.expired')}</Badge>}
                    </TableCell>
                    <TableCell className="py-1.5 text-[10px] hidden lg:table-cell">{v.createdAt ? <div><div>{formatLocal(v.createdAt, 'dd/MM/yyyy')}</div><div className="text-muted-foreground">{formatLocal(v.createdAt, 'HH:mm:ss')}</div></div> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="py-1.5 text-[10px] hidden sm:table-cell">{v.firstLoginAt ? <div><div>{formatLocal(v.firstLoginAt, 'dd/MM/yyyy')}</div><div className="text-muted-foreground">{formatLocal(v.firstLoginAt, 'HH:mm:ss')}</div></div> : <span className="text-muted-foreground italic">-</span>}</TableCell>
                    <TableCell className="py-1.5 text-[10px] hidden md:table-cell">{v.expiresAt ? <div><div>{formatLocal(v.expiresAt, 'dd MMM yyyy HH:mm')}</div>{v.status === 'ACTIVE' && <div className="text-primary font-medium">{timeLeft(v.expiresAt)}</div>}</div> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => openEditSingle(v)} className="p-1 text-primary hover:bg-primary/10 rounded"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => handleDeleteVoucher(v.id, v.code)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 border-t border-border bg-card">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center sm:justify-start">
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              {t('hotspot.showing')} {vouchers.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalVouchers)} {t('hotspot.of')} {totalVouchers.toLocaleString()} {t('nav.voucher')}
            </div>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 {t('hotspot.perPage')}</SelectItem>
                <SelectItem value="100">100 {t('hotspot.perPage')}</SelectItem>
                <SelectItem value="200">200 {t('hotspot.perPage')}</SelectItem>
                <SelectItem value="500">500 {t('hotspot.perPage')}</SelectItem>
                <SelectItem value="1000">1000 {t('hotspot.perPage')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 text-xs px-3"
            >
              {t('hotspot.first')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-8 text-xs px-3"
            >
              {t('hotspot.previous')}
            </Button>
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = idx + 1;
                } else if (currentPage <= 3) {
                  pageNum = idx + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + idx;
                } else {
                  pageNum = currentPage - 2 + idx;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="h-8 w-8 text-xs p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-8 text-xs px-3"
            >
              {t('hotspot.next')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 text-xs px-3"
            >
              {t('hotspot.last')}
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} modal={false}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              {editMode === 'batch' ? `Edit ${editTargetIds.length} Voucher` : 'Edit Voucher'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editMode === 'batch'
                ? `Ubah data untuk ${editTargetIds.length} voucher sekaligus. Field yang dikosongkan tidak akan diubah.`
                : 'Ubah assignment agen, router, atau profil voucher ini.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Profile */}
            <div>
              <Label className="text-xs font-medium">{t('hotspot.profile')}{editMode === 'batch' && <span className="text-muted-foreground ml-1">(kosong = tidak berubah)</span>}</Label>
              <Select
                value={editForm.profileId || 'keep'}
                onValueChange={(v) => setEditForm({ ...editForm, profileId: v === 'keep' ? '' : v })}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder={editMode === 'batch' ? 'Tidak diubah' : t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {editMode === 'batch' && <SelectItem value="keep">— Tidak diubah —</SelectItem>}
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({formatCurrency(p.sellingPrice)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Router */}
            <div>
              <Label className="text-xs font-medium">{t('nav.router')}{editMode === 'batch' && <span className="text-muted-foreground ml-1">(kosong = tidak berubah)</span>}</Label>
              <Select
                value={editForm.clearRouter ? 'clear' : editForm.routerId || 'keep'}
                onValueChange={(v) => setEditForm({ ...editForm, routerId: v === 'keep' || v === 'clear' ? '' : v, clearRouter: v === 'clear' })}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder={editMode === 'batch' ? 'Tidak diubah' : t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  {editMode === 'batch' && <SelectItem value="keep">— Tidak diubah —</SelectItem>}
                  <SelectItem value="clear">Global (hapus router)</SelectItem>
                  {routers.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Agent */}
            <div>
              <Label className="text-xs font-medium">{t('nav.agent')}{editMode === 'batch' && <span className="text-muted-foreground ml-1">(kosong = tidak berubah)</span>}</Label>
              <Select
                value={editForm.clearAgent ? 'clear' : editForm.agentId || 'keep'}
                onValueChange={(v) => setEditForm({ ...editForm, agentId: v === 'keep' || v === 'clear' ? '' : v, clearAgent: v === 'clear' })}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue placeholder={editMode === 'batch' ? 'Tidak diubah' : t('hotspot.noAgent')} />
                </SelectTrigger>
                <SelectContent>
                  {editMode === 'batch' && <SelectItem value="keep">— Tidak diubah —</SelectItem>}
                  <SelectItem value="clear">{t('hotspot.noAgent')} (hapus agen)</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.phone})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)} className="h-9 text-sm">{t('common.cancel')}</Button>
            <Button size="sm" onClick={handleEditSave} disabled={editSaving} className="h-9 text-sm px-6">
              {editSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.loading')}</> : <><Check className="h-4 w-4 mr-2" />Simpan</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Dialog */}
      <Dialog open={isWhatsAppDialogOpen} onOpenChange={setIsWhatsAppDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">{t('whatsapp.send')}</DialogTitle><DialogDescription className="text-xs">{t('whatsapp.send')} {selectedVouchers.length} voucher(s)</DialogDescription></DialogHeader>
          <div><Label className="text-[10px]">{t('whatsapp.phoneNumber')}</Label><Input type="tel" placeholder="628123456789" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} className="h-8 text-xs" /></div>
          <DialogFooter className="gap-2"><Button variant="outline" size="sm" onClick={() => { setIsWhatsAppDialogOpen(false); setWhatsappPhone(''); }} className="h-7 text-xs">{t('common.cancel')}</Button><Button size="sm" onClick={handleWhatsAppSubmit} disabled={sendingWhatsApp || !whatsappPhone} className="h-7 text-xs">{sendingWhatsApp ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('common.loading')}</> : <><MessageCircle className="h-3 w-3 mr-1" />{t('whatsapp.send')}</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen} modal={false}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">{t('hotspot.printVoucher')}</DialogTitle><DialogDescription className="text-xs">{t('common.select')} {t('nav.template')} ({selectedVouchers.length} voucher)</DialogDescription></DialogHeader>
          <div><Label className="text-[10px]">{t('nav.template')}</Label><Select value={selectedTemplate} onValueChange={setSelectedTemplate}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('common.select')} /></SelectTrigger><SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} {t.isDefault && '(Default)'}</SelectItem>)}</SelectContent></Select></div>
          {templates.length === 0 && <p className="text-xs text-warning">{t('common.noData')}</p>}
          <DialogFooter className="gap-2"><Button variant="outline" size="sm" onClick={() => setIsPrintDialogOpen(false)} className="h-7 text-xs">{t('common.cancel')}</Button><Button size="sm" onClick={handlePrint} disabled={!selectedTemplate} className="h-7 text-xs"><Printer className="h-3 w-3 mr-1" />{t('common.print')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} modal={false}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">{t('common.import')} CSV</DialogTitle><DialogDescription className="text-xs">{t('common.upload')} {t('hotspot.code')}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-[10px]">{t('hotspot.csvFile')} *</Label><div className="flex items-center gap-2"><Input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="flex-1 h-8 text-xs" />{importFile && <FileSpreadsheet className="h-4 w-4 text-success" />}</div></div>
            <div><Label className="text-[10px]">{t('hotspot.profile')} *</Label><Select value={importProfileId} onValueChange={setImportProfileId}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('common.select')} /></SelectTrigger><SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name} - {formatCurrency(p.sellingPrice)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-[10px]">{t('hotspot.batchCode')}</Label><Input value={importBatchCode} onChange={(e) => setImportBatchCode(e.target.value)} className="h-8 text-xs" placeholder={t('hotspot.autoGenerate')} /></div>
            {importResult && <div className="p-2 border border-border rounded bg-muted text-xs"><div className="flex items-center gap-1 text-success"><Check className="h-3 w-3" />{importResult.success} {t('notifications.success')}</div>{importResult.failed > 0 && <div className="text-destructive">{importResult.failed} {t('notifications.failed')}</div>}</div>}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" size="sm" onClick={() => { setIsImportDialogOpen(false); setImportFile(null); setImportProfileId(''); setImportBatchCode(''); setImportResult(null); }} className="h-7 text-xs">{t('common.cancel')}</Button><Button size="sm" onClick={handleImport} disabled={!importFile || !importProfileId || importing} className="h-7 text-xs">{importing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('common.loading')}</> : <><Upload className="h-3 w-3 mr-1" />{t('common.import')}</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Confirmation */}
      <AlertDialog open={!!deleteBatchCode} onOpenChange={() => setDeleteBatchCode(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader><AlertDialogTitle className="text-sm">{t('common.delete')} Batch</AlertDialogTitle><AlertDialogDescription className="text-xs">{t('common.delete')} {t('hotspot.unused')}: <strong>{deleteBatchCode}</strong></AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="h-7 text-xs">{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleDeleteBatch} className="h-7 text-xs bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}
