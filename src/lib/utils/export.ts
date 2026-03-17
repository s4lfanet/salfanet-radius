import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatWIB } from '@/lib/timezone';

// PDF Export Utils for server-side (Node.js)
export interface ExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  dateRange?: { start: string; end: string };
  orientation?: 'portrait' | 'landscape';
  companyInfo?: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
}

// Excel Export Utils
export async function generateExcelBuffer(
  data: Record<string, unknown>[],
  columns: { key: string; header: string; width?: number }[],
  sheetName: string = 'Sheet1'
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add headers
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width || 15
  }));

  // Add data rows
  data.forEach(item => {
    const row: Record<string, unknown> = {};
    columns.forEach(col => {
      row[col.key] = item[col.key] ?? '';
    });
    worksheet.addRow(row);
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

// Format currency for export
export function formatCurrencyExport(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

// Format date for export
export function formatDateExport(date: Date | string, format: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'short') {
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format duration to human readable
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Generate CSV from data
export function generateCSV(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[]
): string {
  const headers = columns.map(c => c.header).join(',');
  const rows = data.map(item => 
    columns.map(col => {
      const val = item[col.key];
      // Escape commas and quotes in values
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    }).join(',')
  );
  return [headers, ...rows].join('\n');
}

// PDF data structure for client-side rendering
export interface PDFTableData {
  title: string;
  subtitle?: string;
  dateRange?: string;
  generatedAt: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: { label: string; value: string }[];
}

export function preparePDFData(
  options: ExportOptions,
  headers: string[],
  rows: (string | number)[][],
  summary?: { label: string; value: string }[]
): PDFTableData {
  return {
    title: options.title,
    subtitle: options.subtitle,
    dateRange: options.dateRange 
      ? `${formatDateExport(options.dateRange.start)} - ${formatDateExport(options.dateRange.end)}`
      : undefined,
    generatedAt: formatWIB(new Date()),
    headers,
    rows,
    summary
  };
}

// Generate PDF buffer for server-side export
export function generatePDFBuffer(
  options: ExportOptions,
  headers: string[],
  rows: (string | number)[][],
  summary?: { label: string; value: string }[]
): Uint8Array {
  const orientation = options.orientation || 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Header section
  let yPos = margin;

  // Company name / Subtitle
  if (options.companyInfo?.name || options.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(options.companyInfo?.name || options.subtitle || '', margin, yPos);
    yPos += 6;
  }

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title, margin, yPos);
  yPos += 8;

  // Date range
  if (options.dateRange) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const dateRange = `Periode: ${formatDateExport(options.dateRange.start)} - ${formatDateExport(options.dateRange.end)}`;
    doc.text(dateRange, margin, yPos);
    yPos += 5;
  }

  // Generated date
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const generatedAt = `Generated: ${formatWIB(new Date())}`;
  doc.text(generatedAt, margin, yPos);
  yPos += 8;

  // Summary section (if exists)
  if (summary && summary.length > 0) {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 20, 3, 3, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'bold');
    
    const summaryWidth = (pageWidth - (margin * 2)) / summary.length;
    summary.forEach((item, idx) => {
      const xPos = margin + (idx * summaryWidth) + 5;
      doc.text(item.label, xPos, yPos + 7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(item.value, xPos, yPos + 13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
    });
    
    yPos += 25;
  }

  // Table
  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: rows.map(row => row.map(cell => String(cell))),
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
      halign: 'left'
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 } // No column
    },
    didDrawPage: (data) => {
      // Footer with page number
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const pageNum = `Halaman ${doc.getCurrentPageInfo().pageNumber} dari ${doc.getNumberOfPages()}`;
      doc.text(pageNum, pageWidth - margin - 30, pageHeight - 10);
      doc.text('SALFANET RADIUS', margin, pageHeight - 10);
    }
  });

  // Return as Uint8Array buffer
  const output = doc.output('arraybuffer');
  return new Uint8Array(output);
}

// Generate simple invoice PDF
export function generateInvoicePDF(invoiceData: {
  invoiceNumber: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  items: { description: string; amount: number }[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  dueDate: Date | string;
  status: string;
  companyInfo?: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
}): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  // Company header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(59, 130, 246);
  doc.text(invoiceData.companyInfo?.name || 'SALFANET RADIUS', margin, yPos);
  yPos += 8;

  if (invoiceData.companyInfo?.address) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(invoiceData.companyInfo.address, margin, yPos);
    yPos += 5;
  }

  if (invoiceData.companyInfo?.phone) {
    doc.text(`Tel: ${invoiceData.companyInfo.phone}`, margin, yPos);
    yPos += 5;
  }

  if (invoiceData.companyInfo?.email) {
    doc.text(`Email: ${invoiceData.companyInfo.email}`, margin, yPos);
    yPos += 5;
  }

  // Invoice title
  yPos += 10;
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('INVOICE', pageWidth - margin - 40, margin);

  // Invoice details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, pageWidth - margin - 60, margin + 10);
  doc.text(`Tanggal: ${formatDateExport(new Date())}`, pageWidth - margin - 60, margin + 16);
  doc.text(`Jatuh Tempo: ${formatDateExport(invoiceData.dueDate)}`, pageWidth - margin - 60, margin + 22);

  // Status badge
  const statusColors: Record<string, [number, number, number]> = {
    'PAID': [34, 197, 94],
    'PENDING': [234, 179, 8],
    'OVERDUE': [239, 68, 68],
    'CANCELLED': [156, 163, 175]
  };
  const statusColor = statusColors[invoiceData.status] || [156, 163, 175];
  doc.setFillColor(...statusColor);
  doc.roundedRect(pageWidth - margin - 35, margin + 28, 30, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(invoiceData.status, pageWidth - margin - 28, margin + 33);

  // Customer info box
  yPos = 70;
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, yPos, (pageWidth - (margin * 2)) / 2, 35, 3, 3, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('TAGIHAN KEPADA:', margin + 5, yPos + 8);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(invoiceData.customerName, margin + 5, yPos + 16);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  if (invoiceData.customerAddress) {
    doc.text(invoiceData.customerAddress, margin + 5, yPos + 23);
  }
  if (invoiceData.customerPhone) {
    doc.text(`Tel: ${invoiceData.customerPhone}`, margin + 5, yPos + 29);
  }

  // Items table
  yPos = 115;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Deskripsi', 'Jumlah']],
    body: invoiceData.items.map(item => [
      item.description,
      formatCurrencyExport(item.amount)
    ]),
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 10,
      cellPadding: 5
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 50, halign: 'right' }
    }
  });

  // Totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 5;
  const totalsX = pageWidth - margin - 80;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  
  doc.text('Subtotal:', totalsX, finalY);
  doc.text(formatCurrencyExport(invoiceData.subtotal), pageWidth - margin - 5, finalY, { align: 'right' });

  if (invoiceData.discount) {
    doc.text('Diskon:', totalsX, finalY + 7);
    doc.text(`-${formatCurrencyExport(invoiceData.discount)}`, pageWidth - margin - 5, finalY + 7, { align: 'right' });
  }

  if (invoiceData.tax) {
    doc.text('Pajak:', totalsX, finalY + 14);
    doc.text(formatCurrencyExport(invoiceData.tax), pageWidth - margin - 5, finalY + 14, { align: 'right' });
  }

  // Total line
  const totalY = finalY + (invoiceData.discount ? 7 : 0) + (invoiceData.tax ? 7 : 0) + 7;
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX - 5, totalY, pageWidth - margin, totalY);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL:', totalsX, totalY + 8);
  doc.setTextColor(59, 130, 246);
  doc.text(formatCurrencyExport(invoiceData.total), pageWidth - margin - 5, totalY + 8, { align: 'right' });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Terima kasih atas kepercayaan Anda.', margin, footerY);
  doc.text('Dokumen ini digenerate secara otomatis oleh SALFANET RADIUS', margin, footerY + 5);

  const output = doc.output('arraybuffer');
  return new Uint8Array(output);
}

// Generate voucher cards PDF for printing
export function generateVoucherCardsPDF(vouchers: {
  code: string;
  password?: string;
  profileName: string;
  price: number;
  validity: string;
  batchCode?: string;
}[], companyName: string = 'SALFANET RADIUS'): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  
  // Card dimensions (3 columns x 5 rows per page)
  const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
  const cardHeight = (pageHeight - (margin * 2) - 20) / 5;
  const cardsPerPage = 15;

  vouchers.forEach((voucher, index) => {
    if (index > 0 && index % cardsPerPage === 0) {
      doc.addPage();
    }

    const pageIndex = index % cardsPerPage;
    const col = pageIndex % 3;
    const row = Math.floor(pageIndex / 3);

    const x = margin + (col * (cardWidth + 5));
    const y = margin + (row * (cardHeight + 4));

    // Card background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');

    // Header bar
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(x, y, cardWidth, 8, 3, 3, 'F');
    doc.rect(x, y + 5, cardWidth, 3, 'F'); // Square bottom of header

    // Company name
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(companyName, x + 3, y + 5);

    // Profile name
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(voucher.profileName, x + 3, y + 14);

    // Price
    doc.setFontSize(10);
    doc.setTextColor(59, 130, 246);
    doc.text(formatCurrencyExport(voucher.price), x + 3, y + 21);

    // Validity
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Masa Aktif: ${voucher.validity}`, x + 3, y + 26);

    // Code label
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text('Username:', x + 3, y + 32);

    // Code
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(voucher.code, x + 3, y + 37);

    // Password label
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Password:', x + 3, y + 42);

    // Password
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(voucher.password || voucher.code, x + 3, y + 47);
  });

  const output = doc.output('arraybuffer');
  return new Uint8Array(output);
}
