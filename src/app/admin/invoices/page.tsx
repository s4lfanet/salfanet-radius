'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showSuccess, showError, showConfirm, showToast } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, DollarSign, FileText, CheckCircle, CheckCircle2, Clock, RefreshCw, Eye, AlertCircle, Copy, Check, ExternalLink, MessageCircle, Trash2, Search, Download, Printer, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerUsername: string | null;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  paymentToken: string | null;
  paymentLink: string | null;
  createdAt: string;
  user: {
    customerId: string | null;  // ID Pelanggan
    name: string;
    phone: string;
    email: string | null;
    username: string;
    profile: {
      name: string;
    } | null;
    area: {  // Area
      id: string;
      name: string;
    } | null;
  } | null;
}

interface Stats {
  total: number;
  unpaid: number;
  paid: number;
  pending: number;
  overdue: number;
  totalUnpaidAmount: number;
  totalPaidAmount: number;
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    unpaid: 0,
    paid: 0,
    pending: 0,
    overdue: 0,
    totalUnpaidAmount: 0,
    totalPaidAmount: 0,
  });
  const [activeTab, setActiveTab] = useState('unpaid');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingWA, setSendingWA] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [printDialogInvoice, setPrintDialogInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [broadcasting, setBroadcasting] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState<string>(''); // '' = all-time, 'YYYY-MM' = filtered

  const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const getMonthLabel = (ym: string) => {
    if (!ym) return 'Semua';
    const [y, m] = ym.split('-').map(Number);
    return `${MONTH_NAMES_ID[m - 1]} ${y}`;
  };
  const shiftInvoiceMonth = (delta: number) => {
    const base = invoiceMonth || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const [y, m] = base.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setInvoiceMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  useEffect(() => {
    loadInvoices();
  }, [activeTab, invoiceMonth]);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'unpaid' ? 'PENDING' : activeTab === 'paid' ? 'PAID' : 'all';
      const params = new URLSearchParams({ status });
      if (invoiceMonth) params.set('month', invoiceMonth);
      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
      setStats(data.stats || stats);
    } catch (error) {
      console.error('Load invoices error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredInvoices = () => {
    if (!searchQuery) return invoices;
    const query = searchQuery.toLowerCase();
    return invoices.filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(query) ||
      inv.customerName?.toLowerCase().includes(query) ||
      inv.customerUsername?.toLowerCase().includes(query) ||
      inv.customerPhone?.includes(query)
    );
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsPaymentDialogOpen(true);
  };

  const confirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setProcessing(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedInvoice.id, status: 'PAID' }),
      });

      if (res.ok) {
        setIsPaymentDialogOpen(false);
        loadInvoices();
        showToast(t('invoices.markedAsPaid'), 'success');
      } else {
        const data = await res.json();
        await showError(data.error || t('invoices.failedToMarkPaid'));
      }
    } catch (error) {
      await showError(t('invoices.failedToMarkPaid'));
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateInvoices = async () => {
    const confirmed = await showConfirm(t('invoices.generateConfirm'), t('invoices.generateInvoice'));
    if (!confirmed) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/invoices/generate', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        await showSuccess(data.message, t('invoices.invoicesGenerated'));
        loadInvoices();
      } else {
        await showError(data.message || t('invoices.failedToGenerate'));
      }
    } catch (error) {
      await showError(t('invoices.failedToGenerate'));
    } finally {
      setGenerating(false);
    }
  };

  const handleViewDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailDialogOpen(true);
  };

  const handleCopyPaymentLink = async (invoice: Invoice) => {
    if (!invoice.paymentLink) return;
    try {
      await navigator.clipboard.writeText(invoice.paymentLink);
      setCopiedId(invoice.id);
      setTimeout(() => setCopiedId(null), 2000);
      showToast(t('invoices.paymentLinkCopied'), 'success');
    } catch (error) {
      showToast(t('common.failedToCopy'), 'error');
    }
  };

  const handleSendWhatsApp = async (invoice: Invoice) => {
    if (!invoice.customerPhone) {
      await showError(t('invoices.customerPhoneNotFound'));
      return;
    }

    const confirmed = await showConfirm(t('invoices.sendReminderTo', { name: invoice.customerName || invoice.customerUsername || '' }), t('invoices.sendWhatsApp'));
    if (!confirmed) return;

    setSendingWA(invoice.id);
    try {
      const res = await fetch('/api/invoices/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const data = await res.json();
      if (data.success) {
        await showSuccess(t('invoices.whatsappReminderSent'));
      } else {
        await showError(data.error || t('invoices.failedToSend'));
      }
    } catch (error) {
      await showError(t('invoices.failedToSendWhatsApp'));
    } finally {
      setSendingWA(null);
    }
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelection = new Set(selectedInvoices);
    if (newSelection.has(invoiceId)) {
      newSelection.delete(invoiceId);
    } else {
      newSelection.add(invoiceId);
    }
    setSelectedInvoices(newSelection);
  };

  const toggleSelectAll = () => {
    const filteredInvoices = getFilteredInvoices();
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.id)));
    }
  };

  const handleBroadcastInvoices = async () => {
    if (selectedInvoices.size === 0) {
      await showError(t('invoices.selectMinOneInvoice'));
      return;
    }

    const confirmed = await showConfirm(
      t('invoices.broadcastConfirm', { count: selectedInvoices.size }),
      t('invoices.broadcastBilling')
    );
    if (!confirmed) return;

    setBroadcasting(true);
    try {
      const res = await fetch('/api/whatsapp/broadcast-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: Array.from(selectedInvoices),
        }),
      });

      const data = await res.json();

      if (data.success) {
        await showSuccess(`Broadcast ${t('common.success').toLowerCase()}!\n✅ ${t('whatsapp.sent')}: ${data.successCount}\n❌ ${t('whatsapp.failed')}: ${data.failCount}`);
        setSelectedInvoices(new Set());
      } else {
        await showError(data.error || t('whatsapp.broadcastFailed'));
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      await showError(t('common.failedSendBroadcast'));
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    const confirmed = await showConfirm(
      `${t('invoices.deleteConfirm', { number: invoice.invoiceNumber })}\n\n${invoice.customerName || invoice.customerUsername || 'Unknown'}\n${formatCurrency(Number(invoice.amount))}`,
      t('invoices.deleteInvoice')
    );
    if (!confirmed) return;

    setDeleting(invoice.id);
    try {
      const res = await fetch(`/api/invoices?id=${invoice.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadInvoices();
        showToast(t('invoices.invoiceDeleted'), 'success');
      } else {
        await showError(data.error || t('common.failedDelete'));
      }
    } catch (error) {
      await showError(t('invoices.failedDeleteInvoice'));
    } finally {
      setDeleting(null);
    }
  };

  // Export functions
  const handleExportExcel = async () => {
    try {
      const status = activeTab === 'unpaid' ? 'PENDING' : activeTab === 'paid' ? 'PAID' : 'all';
      let url = `/api/invoices/export?format=excel&status=${status}`;
      if (exportDateFrom) url += `&startDate=${exportDateFrom}`;
      if (exportDateTo) url += `&endDate=${exportDateTo}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob);
      const dateSuffix = exportDateFrom && exportDateTo ? `${exportDateFrom}_to_${exportDateTo}` : new Date().toISOString().split('T')[0];
      a.download = `Invoices-${dateSuffix}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(a.href);
    } catch (error) { console.error('Export error:', error); await showError(t('invoices.exportFailed')); }
  };

  const handleExportPDF = async () => {
    try {
      const status = activeTab === 'unpaid' ? 'PENDING' : activeTab === 'paid' ? 'PAID' : 'all';
      let url = `/api/invoices/export?format=pdf&status=${status}`;
      if (exportDateFrom) url += `&startDate=${exportDateFrom}`;
      if (exportDateTo) url += `&endDate=${exportDateTo}`;
      const res = await fetch(url);
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
        const dateSuffix = exportDateFrom && exportDateTo ? `${exportDateFrom}_to_${exportDateTo}` : new Date().toISOString().split('T')[0];
        doc.save(`Invoices-${dateSuffix}.pdf`);
      }
    } catch (error) { console.error('PDF error:', error); await showError(t('invoices.pdfExportFailed')); }
  };

  const handlePrintInvoice = async (invoice: Invoice) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      const data = await res.json();
      if (!data.success || !data.data) { await showError(t('invoices.failedGetInvoiceData')); return; }
      const inv = data.data;

      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF();

      // Header
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(inv.company.name, 105, 20, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      if (inv.company.address) doc.text(inv.company.address, 105, 26, { align: 'center' });
      if (inv.company.phone) doc.text(`Tel: ${inv.company.phone}`, 105, 31, { align: 'center' });

      // Invoice title
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(t('invoices.pdfInvoice'), 105, 45, { align: 'center' });

      // Invoice details
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`${t('invoices.pdfNo')} ${inv.invoice.number}`, 14, 55);
      doc.text(`${t('invoices.pdfDate')} ${inv.invoice.date}`, 14, 61);
      doc.text(`${t('invoices.pdfDue')} ${inv.invoice.dueDate}`, 14, 67);
      doc.text(`${t('invoices.pdfStatus')} ${inv.invoice.status}`, 14, 73);

      // Customer
      doc.setFont('helvetica', 'bold'); doc.text(`${t('invoices.pdfBillTo')}`, 130, 55);
      doc.setFont('helvetica', 'normal');
      doc.text(inv.customer.name, 130, 61);
      if (inv.customer.phone) doc.text(inv.customer.phone, 130, 67);
      if (inv.customer.username) doc.text(`Username: ${inv.customer.username}`, 130, 73);

      // Items table
      const autoTable = (await import('jspdf-autotable')).default;
      autoTable(doc, {
        head: [[t('invoices.pdfHeaderDesc'), t('invoices.pdfHeaderQty'), t('invoices.pdfHeaderPrice'), t('invoices.pdfHeaderTotal')]],
        body: inv.items.map((item: any) => [item.description, item.quantity, formatCurrency(item.price), formatCurrency(item.total)]),
        startY: 85,
        headStyles: { fillColor: [13, 148, 136] },
        styles: { fontSize: 10 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text(`Total: ${inv.amountFormatted}`, 196, finalY, { align: 'right' });

      if (inv.invoice.paidAt) {
        doc.setFontSize(14); doc.setTextColor(0, 128, 0);
        doc.text(t('invoices.pdfPaid'), 105, finalY + 15, { align: 'center' });
        doc.setFontSize(9); doc.text(`${t('invoices.pdfPaidOn')} ${inv.invoice.paidAt}`, 105, finalY + 21, { align: 'center' });
      }

      doc.save(`Invoice-${inv.invoice.number}.pdf`);
    } catch (error) { console.error('Print error:', error); await showError(t('invoices.failedPrintInvoice')); }
  };

  const handlePrintStandard = async (invoice: Invoice) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      const data = await res.json();
      if (!data.success || !data.data) { await showError(t('invoices.failedGetInvoiceData')); return; }
      const inv = data.data;
      const fmtCurr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const win = window.open('', '_blank', 'width=850,height=1100');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${inv.invoice.number}</title>
      <style>
        @media print { @page { margin: 15mm; } .no-print { display: none !important; } }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 0; padding: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
        .company-name { font-size: 20px; font-weight: bold; color: #0d9488; }
        .company-sub { color: #555; margin-top: 3px; font-size: 10px; line-height: 1.6; }
        .inv-title { font-size: 26px; font-weight: bold; color: #111; letter-spacing: 2px; }
        .inv-number { font-size: 13px; font-weight: bold; color: #0d9488; margin: 4px 0; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .paid-badge { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
        .pending-badge { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .divider { border: none; border-top: 2px solid #0d9488; margin: 14px 0; }
        .thin-divider { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
        .section-title { font-weight: bold; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
        .info-row { margin-bottom: 3px; }
        .info-label { color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #0d9488; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .td-right { text-align: right; }
        .total-row td { font-weight: bold; font-size: 13px; background: #f0fdfa; border-top: 2px solid #0d9488; }
        .paid-stamp { display: block; margin: 20px auto; padding: 12px 28px; border: 4px solid #10b981; border-radius: 10px; text-align: center; width: fit-content; }
        .paid-stamp-text { font-size: 24px; font-weight: bold; color: #10b981; letter-spacing: 6px; }
        .paid-stamp-sub { font-size: 11px; color: #555; margin-top: 2px; }
        .footer { margin-top: 28px; text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 10px 22px; background: #0d9488; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
      </style></head><body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:14px">
          ${inv.company.logo ? `<img src="${inv.company.logo}" style="height:64px;width:auto;object-fit:contain" alt="Logo">` : ''}
          <div>
            <div class="company-name">${inv.company.name}</div>
            <div class="company-sub">
              ${inv.company.address ? `${inv.company.address}<br>` : ''}
              ${inv.company.phone ? `Telp: ${inv.company.phone}<br>` : ''}
              ${inv.company.email ? `${inv.company.email}` : ''}
            </div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="inv-title">INVOICE</div>
          <div class="inv-number">${inv.invoice.number}</div>
          <div>${inv.invoice.status === 'PAID' ? '<span class="status-badge paid-badge">&#10003; SUDAH BAYAR</span>' : '<span class="status-badge pending-badge">BELUM BAYAR</span>'}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="bill-grid">
        <div>
          <div class="section-title">Dari</div>
          <div class="info-row"><strong>${inv.company.name}</strong></div>
          ${inv.company.address ? `<div class="info-row">${inv.company.address}</div>` : ''}
          ${inv.company.phone ? `<div class="info-row">Telp: ${inv.company.phone}</div>` : ''}
        </div>
        <div>
          <div class="section-title">Kepada</div>
          <div class="info-row"><strong>${inv.customer.name}</strong></div>
          ${inv.customer.customerId ? `<div class="info-row"><span class="info-label">ID Pelanggan: </span>${inv.customer.customerId}</div>` : ''}
          ${inv.customer.phone ? `<div class="info-row"><span class="info-label">Telp: </span>${inv.customer.phone}</div>` : ''}
          ${inv.customer.username ? `<div class="info-row"><span class="info-label">Username: </span>${inv.customer.username}</div>` : ''}
          ${inv.customer.area ? `<div class="info-row"><span class="info-label">Area: </span>${inv.customer.area}</div>` : ''}
        </div>
      </div>
      <div class="bill-grid">
        <div>
          <div class="section-title">Detail Invoice</div>
          <div class="info-row"><span class="info-label">No Invoice: </span><strong>${inv.invoice.number}</strong></div>
          <div class="info-row"><span class="info-label">Tanggal: </span>${inv.invoice.date}</div>
          <div class="info-row"><span class="info-label">Jatuh Tempo: </span>${inv.invoice.dueDate}</div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Tgl Bayar: </span>${inv.invoice.paidAt}</div>` : ''}
        </div>
        <div>
          <div class="section-title">Status Pembayaran</div>
          <div class="info-row"><span class="info-label">Status: </span><strong>${inv.invoice.status === 'PAID' ? '&#10003; LUNAS' : inv.invoice.status === 'OVERDUE' ? '&#9888; TERLAMBAT' : '&#9203; BELUM BAYAR'}</strong></div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Dibayar pada: </span>${inv.invoice.paidAt}</div><div class="info-row"><span class="info-label">Via: </span>${inv.paymentLink ? 'Payment Gateway' : 'Manual'}</div>` : ''}
        </div>
      </div>
      <div class="section-title">Rincian Layanan</div>
      <table>
        <thead><tr><th>Deskripsi</th><th style="width:60px;text-align:center">Qty</th><th style="width:130px;text-align:right">Harga</th><th style="width:130px;text-align:right">Total</th></tr></thead>
        <tbody>
          ${inv.items.map((item: { description: string; quantity: number; price: number; total: number }) => `
            <tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td class="td-right">${fmtCurr(item.price)}</td><td class="td-right">${fmtCurr(item.total)}</td></tr>
          `).join('')}
          ${(inv.additionalFees || []).map((fee: { name: string; amount: number }) => `
            <tr><td>${fee.name}</td><td style="text-align:center">1</td><td class="td-right">${fmtCurr(fee.amount)}</td><td class="td-right">${fmtCurr(fee.amount)}</td></tr>
          `).join('')}
          ${inv.tax && inv.tax.hasTax ? `
            <tr style="background:#f9fafb"><td colspan="3" style="text-align:right;font-size:11px;color:#555;padding:5px 10px">Subtotal</td><td class="td-right" style="color:#555;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.baseAmount)}</td></tr>
            <tr style="background:#fffbeb"><td colspan="3" style="text-align:right;font-size:11px;color:#d97706;padding:5px 10px">PPN ${inv.tax.taxRate}%</td><td class="td-right" style="color:#d97706;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.taxAmount)}</td></tr>
          ` : ''}
          <tr class="total-row"><td colspan="3" class="td-right">TOTAL</td><td class="td-right">${inv.amountFormatted}</td></tr>
        </tbody>
      </table>
      ${inv.invoice.paidAt ? `<div class="paid-stamp"><div class="paid-stamp-text">LUNAS</div><div class="paid-stamp-sub">Dibayar pada ${inv.invoice.paidAt}</div></div>` :
        (inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `
        <div style="margin:18px 0;padding:16px;border:1px solid #6ee7b7;border-radius:8px;background:#f0fdfa">
          <div class="section-title" style="margin-bottom:10px">Pembayaran Manual</div>
          <p style="margin:0 0 12px;font-size:11px;color:#555">Transfer ke salah satu rekening berikut sebelum jatuh tempo:</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${inv.company.bankAccounts.map((ba: { bankName: string; accountNumber: string; accountName: string }) => `
              <div style="border:1px solid #0d948840;border-radius:8px;padding:10px 14px;background:#fff">
                <div style="font-weight:bold;font-size:12px;color:#0d9488;margin-bottom:4px">${ba.bankName}</div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">${ba.accountNumber}</div>
                <div style="font-size:11px;color:#555;margin-top:2px">a/n ${ba.accountName}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '')}
      <div class="footer">Terima kasih atas kepercayaan Anda &mdash; ${inv.company.name}</div>
      <button class="print-btn no-print" onclick="window.print()">&#128438; Cetak</button>
      <script>window.onload = function() { window.print(); }</script>
      </body></html>`);
      win.document.close();
    } catch (error) { console.error('Print standard error:', error); await showError(t('invoices.failedPrintInvoice')); }
  };

  const handlePrintThermal = async (invoice: Invoice) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      const data = await res.json();
      if (!data.success || !data.data) { await showError(t('invoices.failedGetInvoiceData')); return; }
      const inv = data.data;
      const fmtCurr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const win = window.open('', '_blank', 'width=400,height=650');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Struk ${inv.invoice.number}</title>
      <style>
        @media print { @page { margin: 0; width: 80mm; } .no-print { display: none !important; } }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 80mm; padding: 5mm 4mm; margin: 0 auto; color: #000; background: #fff; }
        .logo { display:block; max-width: 34mm; max-height: 14mm; margin: 0 auto 3px; object-fit: contain; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 14px; }
        .dashed { border-top: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .row span:first-child { color: #444; flex-shrink: 0; margin-right: 8px; }
        .row span:last-child { text-align: right; }
        .total-row { font-weight: bold; font-size: 13px; }
        .lunas-stamp { display: block; text-align: center; font-size: 17px; font-weight: bold; border: 3px double #000; padding: 4px 14px; margin: 8px auto; width: fit-content; letter-spacing: 3px; }
        .sm { font-size: 10px; color: #555; }
        .bank-box { border: 1px dashed #000; padding: 5px; margin: 4px 0; }
        .print-btn { display: block; margin: 10px auto; padding: 6px 18px; background: #0d9488; color: #fff; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
      </style></head><body>
      ${inv.company.logo ? `<img class="logo" src="${inv.company.logo}" alt="Logo">` : ''}
      <div class="center bold big">${inv.company.name}</div>
      ${inv.company.address ? `<div class="center sm">${inv.company.address}</div>` : ''}
      ${inv.company.phone ? `<div class="center sm">Telp: ${inv.company.phone}</div>` : ''}
      <div class="dashed"></div>
      <div class="row"><span>No</span><span>${inv.invoice.number}</span></div>
      <div class="row"><span>Tgl</span><span>${inv.invoice.date}</span></div>
      <div class="row"><span>Kasir</span><span>Administrator</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Pelanggan</span><span>${inv.customer.name}</span></div>
      ${inv.customer.customerId ? `<div class="row"><span>ID</span><span>${inv.customer.customerId}</span></div>` : ''}
      ${inv.customer.phone ? `<div class="row"><span>Telp</span><span>${inv.customer.phone}</span></div>` : ''}
      ${inv.customer.area ? `<div class="row"><span>Area</span><span>${inv.customer.area}</span></div>` : ''}
      <div class="dashed"></div>
      ${inv.items.map((item: { description: string; quantity: number; price: number }) => `
        <div style="margin-bottom:3px">${item.description}</div>
        <div class="row"><span>&nbsp;&nbsp;${item.quantity} x</span><span>${fmtCurr(item.price)}</span></div>
      `).join('')}
      ${(inv.additionalFees || []).map((fee: { name: string; amount: number }) => `
        <div style="margin-bottom:3px">${fee.name}</div>
        <div class="row"><span>&nbsp;&nbsp;1 x</span><span>${fmtCurr(fee.amount)}</span></div>
      `).join('')}
      <div class="dashed"></div>
      ${inv.tax && inv.tax.hasTax ? `<div class="row"><span>Subtotal</span><span>${fmtCurr(inv.tax.baseAmount)}</span></div><div class="row"><span>PPN ${inv.tax.taxRate}%</span><span>${fmtCurr(inv.tax.taxAmount)}</span></div><div class="dashed"></div>` : ''}
      <div class="row total-row"><span>TOTAL</span><span>${inv.amountFormatted}</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Jatuh Tempo</span><span>${inv.invoice.dueDate}</span></div>
      ${inv.invoice.paidAt ? `
        <div class="dashed"></div>
        <div class="row"><span>Tgl Bayar</span><span>${inv.invoice.paidAt}</span></div>
        <div class="row"><span>Metode</span><span>${inv.paymentLink ? 'Gateway' : 'Manual'}</span></div>
        <div class="lunas-stamp">** LUNAS **</div>
      ` : `${inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `<div style="margin:6px 0"><div class="center bold">Transfer Manual</div>${inv.company.bankAccounts.map((ba: { bankName: string; accountNumber: string; accountName: string }) => `<div class="bank-box"><div class="bold">${ba.bankName}</div><div>${ba.accountNumber}</div><div class="sm">a/n ${ba.accountName}</div></div>`).join('')}</div>` : `<div class="center sm" style="margin:6px 0">Harap bayar sebelum jatuh tempo</div>`}`}
      <div class="dashed"></div>
      <div class="center sm" style="margin-top:4px">Terima kasih</div>
      <button class="print-btn no-print" onclick="window.print()">&#128438; Cetak</button>
      <script>window.onload = function() { window.print(); }</script>
      </body></html>`);
      win.document.close();
    } catch (error) { console.error('Print thermal error:', error); await showError(t('invoices.failedPrintInvoice')); }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string) => formatWIB(new Date(dateStr), 'd MMM yyyy');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-success/10 text-success text-[10px] px-1.5 py-0.5">{t('invoices.paid')}</Badge>;
      case 'PENDING':
        return <Badge className="bg-warning/10 text-warning text-[10px] px-1.5 py-0.5">{t('invoices.pending')}</Badge>;
      case 'OVERDUE':
        return <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5 py-0.5">{t('invoices.overdue')}</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5">{t('invoices.cancelled')}</Badge>;
      default:
        return <Badge className="text-[10px] px-1.5 py-0.5">{status}</Badge>;
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.user?.name?.toLowerCase().includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.user?.phone?.includes(q) ||
      inv.customerPhone?.includes(q)
    );
  });

  if (loading && invoices.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('invoices.title')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('invoices.monthlyBilling')}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {selectedInvoices.size > 0 && (
              <button
                onClick={handleBroadcastInvoices}
                disabled={broadcasting}
                className="inline-flex items-center px-2 py-1.5 text-xs bg-accent text-accent-foreground rounded hover:bg-accent/90 disabled:opacity-50"
              >
                {broadcasting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
                {t('invoices.broadcast')} ({selectedInvoices.size})
              </button>
            )}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Periode:</span>
              <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)}
                className="text-[10px] px-1.5 py-1 bg-[#1a1135]/80 border border-[#bc13fe]/30 rounded text-foreground focus:outline-none focus:border-[#bc13fe]/60" />
              <span className="text-[10px] text-[#e0d0ff]/40">–</span>
              <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)}
                className="text-[10px] px-1.5 py-1 bg-[#1a1135]/80 border border-[#bc13fe]/30 rounded text-foreground focus:outline-none focus:border-[#bc13fe]/60" />
            </div>
            <button onClick={handleExportExcel} className="inline-flex items-center px-2 py-1.5 text-xs border border-success text-success rounded hover:bg-success/10"><Download className="h-3 w-3 mr-1" />Excel</button>
            <button onClick={handleExportPDF} className="inline-flex items-center px-2 py-1.5 text-xs border border-destructive text-destructive rounded hover:bg-destructive/10"><Download className="h-3 w-3 mr-1" />PDF</button>
            <Link href="/admin/invoices/import">
              <button className="inline-flex items-center px-2 py-1.5 text-xs border border-[#bc13fe]/60 text-foreground rounded hover:bg-[#bc13fe]/10">
                <Upload className="h-3 w-3 mr-1" />Import CSV
              </button>
            </Link>
            <Button onClick={handleGenerateInvoices} disabled={generating} size="sm" className="h-8 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              {t('invoices.generateInvoice')}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('common.total')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats.total}</p>
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg shadow-lg bg-[#bc13fe]/20 flex-shrink-0">
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('invoices.pending')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats.unpaid}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{formatCurrency(Number(stats.totalUnpaidAmount))}</p>
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg shadow-lg bg-red-400/20 flex-shrink-0">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('invoices.paid')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats.paid}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{formatCurrency(Number(stats.totalPaidAmount))}</p>
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg shadow-lg bg-green-400/20 flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('invoices.overdue')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats.overdue}</p>
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg shadow-lg bg-amber-400/20 flex-shrink-0">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-card rounded-lg border border-border">
          {/* Tabs & Search */}
          <div className="p-3 border-b border-border flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <div className="flex gap-1">
              {[
                { key: 'unpaid', label: `${t('invoices.pending')} (${stats.unpaid})` },
                { key: 'paid', label: `${t('invoices.paid')} (${stats.paid})` },
                { key: 'all', label: `${t('common.all')} (${stats.total})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Month Filter */}
            <div className="flex items-center gap-1 border border-border rounded-lg bg-muted/30 px-1 py-1">
              <button
                onClick={() => shiftInvoiceMonth(-1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setInvoiceMonth('')}
                className="text-xs font-medium text-foreground min-w-[90px] text-center hover:text-primary transition-colors"
                title="Klik untuk reset ke semua"
              >
                {getMonthLabel(invoiceMonth)}
              </button>
              <button
                onClick={() => shiftInvoiceMonth(1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('common.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="text-[10px] py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.size === getFilteredInvoices().length && getFilteredInvoices().length > 0}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </TableHead>
                  <TableHead className="text-[10px] py-2">{t('invoices.invoiceNumber')}</TableHead>
                  <TableHead className="text-[10px] py-2 hidden xl:table-cell">{t('invoices.customerId')}</TableHead>
                  <TableHead className="text-[10px] py-2">{t('invoices.customer')}</TableHead>
                  <TableHead className="text-[10px] py-2 hidden lg:table-cell">{t('common.email')}</TableHead>
                  <TableHead className="text-[10px] py-2 hidden lg:table-cell">{t('nav.profile')}</TableHead>
                  <TableHead className="text-[10px] py-2 hidden xl:table-cell">{t('common.area')}</TableHead>
                  <TableHead className="text-[10px] py-2 text-right">{t('invoices.amount')}</TableHead>
                  <TableHead className="text-[10px] py-2">{t('invoices.status')}</TableHead>
                  <TableHead className="text-[10px] py-2 hidden sm:table-cell">{t('invoices.dueDate')}</TableHead>
                  <TableHead className="text-[10px] py-2 text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      <AlertCircle className="h-5 w-5 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">{t('common.noData')}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="text-xs">
                      <TableCell className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedInvoices.has(invoice.id)}
                          onChange={() => toggleInvoiceSelection(invoice.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </TableCell>
                      <TableCell className="py-2 font-mono font-medium text-[10px]">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="py-2 hidden xl:table-cell text-[10px] text-muted-foreground">
                        {invoice.user?.customerId || '-'}
                      </TableCell>
                      <TableCell className="py-2 text-[10px]">
                        <div>
                          <div className="font-medium truncate max-w-[120px]">{invoice.user?.name || invoice.customerName || t('invoices.deleted')}</div>
                          <div className="text-muted-foreground text-[9px] truncate max-w-[120px]">{invoice.user?.phone || invoice.customerPhone || '-'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 hidden lg:table-cell text-[10px] text-muted-foreground truncate max-w-[150px]">{invoice.user?.email || invoice.customerEmail || '-'}</TableCell>
                      <TableCell className="py-2 hidden lg:table-cell text-[10px] text-muted-foreground">{invoice.user?.profile?.name || '-'}</TableCell>
                      <TableCell className="py-2 hidden xl:table-cell text-[10px] text-muted-foreground">
                        {invoice.user?.area?.name || '-'}
                      </TableCell>
                      <TableCell className="py-2 text-right font-medium text-xs">{formatCurrency(Number(invoice.amount))}</TableCell>
                      <TableCell className="py-2">{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="py-2 hidden sm:table-cell text-[10px] text-muted-foreground">{formatDate(invoice.dueDate)}</TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {invoice.paymentLink && (
                            <button onClick={() => handleCopyPaymentLink(invoice)} className="p-1 hover:bg-muted rounded" title="Copy Link">
                              {copiedId === invoice.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          )}
                          <button onClick={() => setPrintDialogInvoice(invoice)} className="p-1 hover:bg-muted rounded" title="Print">
                            <Printer className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleViewDetail(invoice)} className="p-1 hover:bg-muted rounded" title="View">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          </button>
                          {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && invoice.customerPhone && (
                            <button onClick={() => handleSendWhatsApp(invoice)} disabled={sendingWA === invoice.id} className="p-1 hover:bg-muted rounded" title="WhatsApp">
                              {sendingWA === invoice.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          )}
                          {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
                            <button onClick={() => handleMarkAsPaid(invoice)} className="px-1.5 py-0.5 text-[10px] font-medium bg-success text-success-foreground rounded hover:bg-success/90">
                              {t('invoices.markAsPaid')}
                            </button>
                          )}
                          <button onClick={() => handleDeleteInvoice(invoice)} disabled={deleting === invoice.id} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Delete">
                            {deleting === invoice.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-border">
            {filteredInvoices.length === 0 ? (
              <div className="px-3 py-8 text-center text-muted-foreground">
                <AlertCircle className="h-5 w-5 mx-auto mb-1 opacity-50" />
                <p className="text-xs">{t('common.noData')}</p>
              </div>
            ) : (
              filteredInvoices.map((invoice) => (
                <div key={invoice.id} className="p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(invoice.id)}
                        onChange={() => toggleInvoiceSelection(invoice.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] font-medium text-foreground">{invoice.invoiceNumber}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {getStatusBadge(invoice.status)}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground whitespace-nowrap">{formatCurrency(Number(invoice.amount))}</span>
                  </div>
                  <div className="space-y-1 text-[11px] ml-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('invoices.customer')}:</span>
                      <span className="font-medium text-foreground truncate ml-2">{invoice.user?.name || invoice.customerName || t('invoices.deleted')}</span>
                    </div>
                    {(invoice.user?.customerId) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ID Pelanggan:</span>
                        <span className="font-mono text-[#00f7ff]">{invoice.user.customerId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="text-muted-foreground">{invoice.user?.phone || invoice.customerPhone || '-'}</span>
                    </div>
                    {invoice.user?.profile?.name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('nav.profile')}:</span>
                        <span className="text-muted-foreground">{invoice.user.profile.name}</span>
                      </div>
                    )}
                    {invoice.user?.area?.name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('common.area')}:</span>
                        <span className="text-muted-foreground">{invoice.user.area.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('invoices.dueDate')}:</span>
                      <span className="text-muted-foreground">{formatDate(invoice.dueDate)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-2 ml-6">
                    {invoice.paymentLink && (
                      <button onClick={() => handleCopyPaymentLink(invoice)} className="p-1.5 hover:bg-muted rounded" title="Copy Link">
                        {copiedId === invoice.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    )}
                    <button onClick={() => setPrintDialogInvoice(invoice)} className="p-1.5 hover:bg-muted rounded" title="Print">
                      <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleViewDetail(invoice)} className="p-1.5 hover:bg-muted rounded" title="View">
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && invoice.customerPhone && (
                      <button onClick={() => handleSendWhatsApp(invoice)} disabled={sendingWA === invoice.id} className="p-1.5 hover:bg-muted rounded" title="WhatsApp">
                        {sendingWA === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    )}
                    {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
                      <button onClick={() => handleMarkAsPaid(invoice)} className="px-2 py-1 text-[10px] font-medium bg-success text-success-foreground rounded hover:bg-success/90">
                        {t('invoices.markAsPaid')}
                      </button>
                    )}
                    <button onClick={() => handleDeleteInvoice(invoice)} disabled={deleting === invoice.id} className="p-1.5 hover:bg-destructive/10 rounded text-destructive" title="Delete">
                      {deleting === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Result count */}
          <div className="px-3 py-2 border-t border-border bg-muted">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {t('table.showing')} {filteredInvoices.length} {t('table.of')} {invoices.length}
            </p>
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">{t('common.details')}</DialogTitle>
              <DialogDescription className="text-xs">{selectedInvoice?.invoiceNumber}</DialogDescription>
            </DialogHeader>
            {selectedInvoice && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('invoices.invoiceNumber')}</p>
                    <p className="font-mono font-medium">{selectedInvoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('invoices.status')}</p>
                    <div className="mt-0.5">{getStatusBadge(selectedInvoice.status)}</div>
                  </div>
                </div>
                <div className="border-t pt-3 border-border">
                  <p className="text-[10px] text-muted-foreground">{t('invoices.customer')}</p>
                  <p className="font-medium">{selectedInvoice.user?.name || selectedInvoice.customerName || t('invoices.deleted')}</p>
                  <p className="text-muted-foreground">{selectedInvoice.user?.phone || selectedInvoice.customerPhone || '-'}</p>
                  {(selectedInvoice.user?.email || selectedInvoice.customerEmail) && (
                    <p className="text-muted-foreground text-[10px]">📧 {selectedInvoice.user?.email || selectedInvoice.customerEmail}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('nav.profile')}</p>
                    <p>{selectedInvoice.user?.profile?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('invoices.amount')}</p>
                    <p className="text-base font-bold text-success">{formatCurrency(Number(selectedInvoice.amount))}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('invoices.createdAt')}</p>
                    <p>{formatDate(selectedInvoice.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('invoices.dueDate')}</p>
                    <p>{formatDate(selectedInvoice.dueDate)}</p>
                  </div>
                </div>
                {selectedInvoice.paymentLink && (
                  <div className="border-t pt-3 border-border">
                    <p className="text-[10px] text-muted-foreground mb-1.5">{t('invoices.paymentLink')}</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={selectedInvoice.paymentLink}
                        readOnly
                        className="flex-1 px-2 py-1.5 text-[10px] bg-muted border border-border rounded font-mono truncate"
                      />
                      <button onClick={() => handleCopyPaymentLink(selectedInvoice)} className="p-1.5 hover:bg-muted rounded">
                        {copiedId === selectedInvoice.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => window.open(selectedInvoice.paymentLink!, '_blank')} className="p-1.5 hover:bg-muted rounded">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setIsDetailDialogOpen(false)} size="sm" className="h-8 text-xs">{t('common.close')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Dialog */}
        <Dialog open={printDialogInvoice !== null} onOpenChange={(open) => { if (!open) setPrintDialogInvoice(null); }}>
          <DialogContent className="max-w-xs p-0 overflow-hidden gap-0">
            <div className="h-1 w-full bg-gradient-to-r from-primary to-blue-400" />
            <div className="p-5">
              <DialogHeader className="mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-full bg-primary/15 border border-primary/30">
                    <Printer className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm font-bold">Pilih Jenis Printer</DialogTitle>
                    <DialogDescription className="text-[11px] font-mono mt-0.5">
                      {printDialogInvoice?.invoiceNumber}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { if (printDialogInvoice) { setPrintDialogInvoice(null); handlePrintStandard(printDialogInvoice); } }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <FileText className="w-5 h-5 flex-shrink-0" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Standar Printer</div>
                    <div className="text-[11px] opacity-80">A4 / Letter &mdash; invoice lengkap</div>
                  </div>
                </button>
                <button
                  onClick={() => { if (printDialogInvoice) { setPrintDialogInvoice(null); handlePrintThermal(printDialogInvoice); } }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  <Printer className="w-5 h-5 flex-shrink-0" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Thermal Printer</div>
                    <div className="text-[11px] opacity-80">58mm / 80mm &mdash; struk kasir</div>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPrintDialogInvoice(null)}
                  size="sm"
                  className="h-8 text-xs"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent className="max-w-xs p-0 overflow-hidden gap-0">
            {/* Coloured header strip */}
            <div className="h-1 w-full bg-gradient-to-r from-success to-emerald-400" />
            <div className="p-5">
              <DialogHeader className="mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-full bg-success/15 border border-success/30">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm font-bold">{t('invoices.markAsPaid')}</DialogTitle>
                    <DialogDescription className="text-[11px] font-mono mt-0.5">
                      {selectedInvoice?.invoiceNumber}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <form onSubmit={confirmPayment} className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/30 divide-y divide-border/40">
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-[11px] text-muted-foreground">{t('invoices.customer')}</span>
                    <span className="text-xs font-semibold">{selectedInvoice?.user?.name || selectedInvoice?.customerName || t('invoices.deleted')}</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-[11px] text-muted-foreground">{t('invoices.amount')}</span>
                    <span className="text-sm font-bold text-success">{formatCurrency(Number(selectedInvoice?.amount || 0))}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-info/10 border border-info/20 rounded-xl px-3 py-2.5">
                  <CheckCircle className="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-info leading-snug">{t('invoices.expiryExtendedNote')}</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={processing} size="sm" className="flex-1 h-9 text-xs">
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={processing} size="sm" className="flex-1 h-9 text-xs bg-success hover:bg-success/90 text-white">
                    {processing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    {t('common.confirm')}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
