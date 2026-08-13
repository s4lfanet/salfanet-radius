// ─── Export Utilities (Excel & PDF) ──────────────────────────────────────────
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { monthLabel } from './format'

// ── Export Laporan Keuangan ke Excel ──────────────────────────────────────────
export const exportExcel = (invoices, byDusun, discounts, period) => {
  const wb = XLSX.utils.book_new()

  const paidInv     = invoices.filter(i => i.status === 'paid' && i.payment_method !== 'discount')
  const discountInv = invoices.filter(i => i.payment_method === 'discount')
  const unpaidInv   = invoices.filter(i => i.status !== 'paid')
  const totalOmzet   = paidInv.reduce((s, i) => s + Number(i.amount), 0)
  const totalDiskon  = discountInv.reduce((s, i) => s + Number(i.amount), 0)
  const totalPiutang = unpaidInv.reduce((s, i) => s + Number(i.amount), 0)

  // Sheet 1: Ringkasan
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Laporan Keuangan', period],
    [],
    ['Keterangan', 'Jumlah', 'Total (Rp)'],
    ['Lunas (Omzet)', paidInv.length, totalOmzet],
    ['Diskon', discountInv.length, totalDiskon],
    ['Belum Bayar', unpaidInv.length, totalPiutang],
    ['Total Invoice', invoices.length, totalOmzet + totalDiskon + totalPiutang],
  ])
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan')

  // Sheet 2: Detail Invoice
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
    inv.dusun || '-',
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([invHeaders, ...invRows]), 'Detail Invoice')

  // Sheet 3: Rekap Per Dusun
  if (byDusun?.length) {
    const rows = byDusun.map(d => [
      d.dusun || 'Tanpa Dusun',
      Number(d.paid_count),
      Number(d.discount_count),
      Number(d.unpaid_count),
      Number(d.paid_count) + Number(d.discount_count) + Number(d.unpaid_count),
      Number(d.omzet),
    ])
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet([['Dusun', 'Lunas', 'Diskon', 'Belum Bayar', 'Total', 'Omzet (Rp)'], ...rows]),
      'Rekap Per Dusun'
    )
  }

  // Sheet 4: Rekap Diskon
  if (discounts?.length) {
    const rows = discounts.map((d, idx) => [
      idx + 1, d.username, d.fullname || '', d.period,
      Number(d.amount), d.discount_reason || '-', d.approved_by_name || '-',
      d.paid_at ? new Date(d.paid_at).toLocaleDateString('id-ID') : '-',
    ])
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet([['No', 'Username', 'Nama', 'Periode', 'Jumlah Diskon (Rp)', 'Alasan', 'Disetujui Oleh', 'Tgl Diskon'], ...rows]),
      'Rekap Diskon'
    )
  }

  XLSX.writeFile(wb, `laporan-keuangan-${period}.xlsx`)
}

// ── Export Laporan Keuangan ke PDF ────────────────────────────────────────────
export const exportPDF = (invoices, byDusun, discounts, period) => {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const fmtRp = (v) => 'Rp ' + Number(v).toLocaleString('id-ID')

  const paidInv     = invoices.filter(i => i.status === 'paid' && i.payment_method !== 'discount')
  const discountInv = invoices.filter(i => i.payment_method === 'discount')
  const unpaidInv   = invoices.filter(i => i.status !== 'paid')
  const totalOmzet   = paidInv.reduce((s, i) => s + Number(i.amount), 0)
  const totalDiskon  = discountInv.reduce((s, i) => s + Number(i.amount), 0)
  const totalPiutang = unpaidInv.reduce((s, i) => s + Number(i.amount), 0)

  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('Laporan Keuangan', pageW / 2, 18, { align: 'center' })
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text(`Periode: ${monthLabel(period)}`, pageW / 2, 25, { align: 'center' })
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageW / 2, 30, { align: 'center' })

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Ringkasan', 14, 40)
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

  if (byDusun?.length) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text('Rekap Per Dusun', 14, doc.lastAutoTable.finalY + 10)
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Dusun', 'Total', 'Lunas', 'Diskon', 'Belum Bayar', 'Omzet']],
      body: byDusun.map(d => [
        d.dusun || '(Tanpa Dusun)',
        Number(d.paid_count) + Number(d.discount_count) + Number(d.unpaid_count),
        Number(d.paid_count), Number(d.discount_count), Number(d.unpaid_count), fmtRp(d.omzet),
      ]),
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 255] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' } },
      styles: { fontSize: 9 },
    })
  }

  if (discounts?.length) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text('Rekap Diskon', 14, doc.lastAutoTable.finalY + 10)
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Username', 'Nama', 'Periode', 'Jumlah Diskon', 'Alasan', 'Tgl']],
      body: discounts.map(d => [
        d.username, d.fullname || '-', d.period, fmtRp(d.amount),
        d.discount_reason || '-',
        d.paid_at ? new Date(d.paid_at).toLocaleDateString('id-ID') : '-',
      ]),
      headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      columnStyles: { 3: { halign: 'right' } },
      styles: { fontSize: 8 },
    })
  }

  // Detail Invoice — halaman baru
  doc.addPage()
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text(`Detail Invoice — ${monthLabel(period)}`, 14, 15)
  autoTable(doc, {
    startY: 19,
    head: [['Username', 'Nama', 'Periode', 'Nominal', 'Status', 'Tgl Bayar']],
    body: invoices.map(inv => [
      inv.username, inv.fullname || '-', monthLabel(inv.period), fmtRp(inv.amount),
      inv.status === 'paid' ? (inv.payment_method === 'discount' ? 'Diskon' : 'Lunas') : 'Belum Bayar',
      inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('id-ID') : '-',
    ]),
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: { 3: { halign: 'right' } },
    styles: { fontSize: 8 },
  })

  // Footer tiap halaman
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150)
    doc.text(`Halaman ${p} dari ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    doc.text('billing.pmynet.id', 14, doc.internal.pageSize.getHeight() - 8)
    doc.setTextColor(0)
  }

  doc.save(`laporan-keuangan-${period}.pdf`)
}

// ── Export Rekap Kinerja Teknisi ke Excel ─────────────────────────────────────
export const exportRekapTeknisiExcel = (techStats, rekapMonth, prevMonth, prev2Month) => {
  const wb = XLSX.utils.book_new()
  const periodLabel = monthLabel(rekapMonth)

  const summaryRows = [
    [`Rekap Kinerja Teknisi — ${periodLabel}`],
    [`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`],
    [],
    ['Teknisi', monthLabel(prev2Month), monthLabel(prevMonth), monthLabel(rekapMonth), 'Total Sepanjang Masa'],
    ...techStats.map(t => [t.fullname || t.username, t.prev2Month, t.prevMonth, t.thisMonth, t.total])
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan')

  techStats.forEach(tech => {
    const thisMonthInstalls = tech.installs
      .filter(u => u.install_date?.slice(0, 7) === rekapMonth)
      .sort((a, b) => new Date(a.install_date) - new Date(b.install_date))
    if (!thisMonthInstalls.length) return

    const rows = [
      [`Detail Instalasi: ${tech.fullname || tech.username} — ${periodLabel}`],
      [],
      ['No', 'Customer ID', 'Nama Pelanggan', 'Username', 'Paket', 'Wilayah', 'Tanggal Pasang'],
      ...thisMonthInstalls.map((u, i) => [
        i + 1, u.customer_id || '-', u.fullname || u.username, u.username,
        u.groupname || '-', u.territory_name || '-',
        u.install_date ? new Date(u.install_date).toLocaleDateString('id-ID') : '-',
      ])
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws, (tech.fullname || tech.username).slice(0, 28))
  })

  XLSX.writeFile(wb, `rekap-teknisi-${rekapMonth}.xlsx`)
}
