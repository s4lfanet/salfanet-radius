import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import * as ExcelJS from 'exceljs';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== INVOICE PDF ====================

  async generateInvoicePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: { select: { username: true, name: true, phone: true, address: true, profile: { select: { name: true } } } },
      },
    });
    if (!invoice) throw new Error('Invoice not found');

    const company = await this.prisma.company.findFirst();
    const companyName = company?.name || 'Salfanet';
    const companyAddress = company?.address || '';
    const companyPhone = company?.phone || '';
    const companyEmail = company?.email || '';

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text(companyName, { align: 'left' });
      doc.fontSize(10).text(companyAddress, { align: 'left' });
      doc.text(`Phone: ${companyPhone} | Email: ${companyEmail}`, { align: 'left' });
      doc.moveDown();
      doc.fontSize(16).text('INVOICE', { align: 'right' });
      doc.moveDown();

      // Invoice info
      doc.fontSize(10);
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'right' });
      doc.text(`Date: ${invoice.createdAt.toLocaleDateString('id-ID')}`, { align: 'right' });
      doc.text(`Due Date: ${invoice.dueDate?.toLocaleDateString('id-ID') || '-'}`, { align: 'right' });
      doc.text(`Status: ${invoice.status}`, { align: 'right' });
      doc.moveDown();

      // Bill to
      doc.fontSize(10).text('Bill To:', { align: 'left' });
      doc.text(invoice.user?.name || invoice.customerName || 'Customer', { align: 'left' });
      if (invoice.user?.phone) doc.text(`Phone: ${invoice.user.phone}`, { align: 'left' });
      if (invoice.user?.address) doc.text(`Address: ${invoice.user.address}`, { align: 'left' });
      doc.moveDown();

      // Items table
      const tableTop = doc.y + 10;
      doc.fontSize(10);
      doc.text('Description', 50, tableTop);
      doc.text('Amount', 400, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      doc.text(`Package: ${invoice.user?.profile?.name || 'Internet Service'}`, 50, tableTop + 25);
      doc.text(`Rp ${Number(invoice.amount).toLocaleString('id-ID')}`, 400, tableTop + 25);
      doc.moveTo(50, tableTop + 45).lineTo(550, tableTop + 45).stroke();

      // Total
      doc.moveDown();
      doc.fontSize(12).text(`Total: Rp ${Number(invoice.amount).toLocaleString('id-ID')}`, { align: 'right' });

      // Footer
      doc.moveDown(2);
      doc.fontSize(9).fillColor('gray').text('Thank you for your business.', { align: 'center' });
      doc.end();
    });
  }

  // ==================== INVOICE EXCEL ====================

  async exportInvoicesExcel(params: { status?: string; startDate?: string; endDate?: string }): Promise<Buffer> {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as any).gte = new Date(params.startDate);
      if (params.endDate) (where.createdAt as any).lt = new Date(params.endDate);
    }
    const invoices = await this.prisma.invoice.findMany({
      where: where as never,
      include: { user: { select: { username: true, name: true, phone: true } } },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoices');
    sheet.columns = [
      { header: 'Invoice Number', key: 'invoiceNumber', width: 25 },
      { header: 'Customer', key: 'customerName', width: 25 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Created', key: 'createdAt', width: 20 },
      { header: 'Due Date', key: 'dueDate', width: 20 },
    ];
    for (const inv of invoices) {
      sheet.addRow({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.user?.name || inv.customerName || '',
        username: inv.user?.username || '',
        phone: inv.user?.phone || '',
        amount: Number(inv.amount),
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
        dueDate: inv.dueDate?.toISOString() || '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  }

  // ==================== PPPoE USERS EXCEL ====================

  async exportPppoeUsersExcel(params: { status?: string; areaId?: string; profileId?: string }): Promise<Buffer> {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.areaId) where.areaId = params.areaId;
    if (params.profileId) where.profileId = params.profileId;
    const users = await this.prisma.pppoeUser.findMany({
      where: where as never,
      include: { profile: { select: { name: true } }, area: { select: { name: true } } },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PPPoE Users');
    sheet.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Profile', key: 'profileName', width: 20 },
      { header: 'Area', key: 'areaName', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Expired', key: 'expiredAt', width: 20 },
      { header: 'Address', key: 'address', width: 30 },
    ];
    for (const u of users) {
      sheet.addRow({
        username: u.username,
        name: u.name || '',
        phone: u.phone || '',
        profileName: u.profile?.name || '',
        areaName: (u as any).area?.name || '',
        status: u.status,
        expiredAt: u.expiredAt?.toISOString() || '',
        address: u.address || '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  }

  // ==================== HOTSPOT VOUCHER EXCEL ====================

  async exportHotspotVouchersExcel(params: { status?: string; profileId?: string }): Promise<Buffer> {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.profileId) where.profileId = params.profileId;
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: where as never,
      include: { profile: { select: { name: true, sellingPrice: true } }, agent: { select: { name: true } } },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Vouchers');
    sheet.columns = [
      { header: 'Code', key: 'code', width: 15 },
      { header: 'Profile', key: 'profileName', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Agent', key: 'agentName', width: 20 },
      { header: 'Price', key: 'sellingPrice', width: 12 },
      { header: 'Created', key: 'createdAt', width: 20 },
      { header: 'Expires', key: 'expiresAt', width: 20 },
    ];
    for (const v of vouchers) {
      sheet.addRow({
        code: v.code,
        profileName: v.profile?.name || '',
        status: v.status,
        agentName: v.agent?.name || '',
        sellingPrice: v.profile?.sellingPrice ? Number(v.profile.sellingPrice) : 0,
        createdAt: v.createdAt.toISOString(),
        expiresAt: v.expiresAt?.toISOString() || '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  }

  // ==================== HOTSPOT REKAP EXCEL ====================

  async exportHotspotRekapExcel(params: { startDate?: string; endDate?: string; agentId?: string }): Promise<Buffer> {
    const where: Record<string, unknown> = {};
    if (params.agentId) where.agentId = params.agentId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as any).gte = new Date(params.startDate);
      if (params.endDate) (where.createdAt as any).lt = new Date(params.endDate);
    }
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: where as never,
      include: { profile: { select: { name: true, sellingPrice: true } }, agent: { select: { name: true } } },
      take: 5000,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rekap Voucher');
    sheet.columns = [
      { header: 'Agent', key: 'agentName', width: 20 },
      { header: 'Profile', key: 'profileName', width: 20 },
      { header: 'Total Voucher', key: 'total', width: 12 },
      { header: 'Active', key: 'active', width: 10 },
      { header: 'Sold', key: 'sold', width: 10 },
      { header: 'Expired', key: 'expired', width: 10 },
      { header: 'Revenue', key: 'revenue', width: 15 },
    ];
    const groups = new Map<string, any>();
    for (const v of vouchers) {
      const key = `${v.agent?.name || 'No Agent'}|${v.profile?.name || 'No Profile'}`;
      if (!groups.has(key)) {
        groups.set(key, { agentName: v.agent?.name || 'No Agent', profileName: v.profile?.name || 'No Profile', total: 0, active: 0, sold: 0, expired: 0, revenue: 0 });
      }
      const g = groups.get(key);
      g.total++;
      if (v.status === 'ACTIVE') g.active++;
      if (v.status === 'SOLD') g.sold++;
      if (v.status === 'EXPIRED') g.expired++;
      if (v.status === 'SOLD' || v.status === 'ACTIVE') g.revenue += Number(v.profile?.sellingPrice || 0);
    }
    for (const g of groups.values()) sheet.addRow(g);
    sheet.getRow(1).font = { bold: true };
    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  }
}
