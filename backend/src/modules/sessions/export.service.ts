import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTimezoneOffsetMs } from '../../common/utils/timezone';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(2)} ${units[exponent]}`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatDate(date: Date | string | null, tzOffsetMs = 0): string {
  if (!date) return '-';
  const d = new Date(date);
  const local = new Date(d.getTime() + tzOffsetMs);
  return local.toISOString().replace('T', ' ').substring(0, 19);
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export sessions to Excel — ported from /lib/utils/export.ts.
   * Uses exceljs to generate .xlsx files.
   */
  async exportSessionsToExcel(params: {
    type?: string; routerId?: string; username?: string;
    startDate?: string; endDate?: string; mode?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const creator = 'salfanet-radius';
    workbook.creator = creator;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Sessions', {
      properties: { defaultColWidth: 18 },
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const mode = params.mode || 'history';
    const tzOffsetMs = getTimezoneOffsetMs();

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Username', key: 'username', width: 22 },
      { header: 'Session ID', key: 'sessionId', width: 30 },
      { header: 'Router', key: 'router', width: 18 },
      { header: 'NAS IP', key: 'nasIp', width: 15 },
      { header: 'IP Address', key: 'framedIp', width: 15 },
      { header: 'MAC Address', key: 'macAddress', width: 19 },
      { header: 'Start Time', key: 'startTime', width: 20 },
      ...(mode === 'history' ? [{ header: 'Stop Time', key: 'stopTime', width: 20 }] : []),
      { header: 'Duration', key: 'duration', width: 12 },
      { header: 'Upload', key: 'upload', width: 12 },
      { header: 'Download', key: 'download', width: 12 },
      { header: 'Total', key: 'total', width: 12 },
      ...(mode === 'history' ? [{ header: 'Terminate Cause', key: 'terminateCause', width: 18 }] : []),
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;

    // Fetch session data
    const sessions = await this.fetchSessions(params);

    const routers = await this.prisma.router.findMany();
    const routerMap = new Map(routers.map((r) => [r.nasname, r.name]));

    sessions.forEach((s, idx) => {
      const row: Record<string, unknown> = {
        no: idx + 1,
        username: s.username,
        sessionId: s.acctsessionid,
        router: routerMap.get(s.nasipaddress) || s.nasipaddress,
        nasIp: s.nasipaddress,
        framedIp: s.framedipaddress || '-',
        macAddress: s.callingstationid || '-',
        startTime: formatDate(s.acctstarttime, tzOffsetMs),
        duration: s.acctsessiontime ? formatDuration(Number(s.acctsessiontime)) : 'N/A',
        upload: formatBytes(Number(s.acctinputoctets || 0)),
        download: formatBytes(Number(s.acctoutputoctets || 0)),
        total: formatBytes(Number(s.acctinputoctets || 0) + Number(s.acctoutputoctets || 0)),
      };
      if (mode === 'history') {
        row.stopTime = formatDate(s.acctstoptime, tzOffsetMs);
        row.terminateCause = s.acctterminatecause || '-';
      }
      worksheet.addRow(row);
    });

    // Auto-filter on header
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().substring(0, 10);
    const filename = `sessions-${mode}-${dateStr}.xlsx`;
    return { buffer: Buffer.from(buffer), filename };
  }

  /**
   * Export sessions to PDF — simple table-based PDF using exceljs buffer + minimal PDF generation.
   * Note: The legacy /lib/utils/export.ts uses a PDF library; here we generate a basic PDF
   * using a minimal raw PDF structure for compatibility. For richer PDFs, pdfkit/puppeteer
   * should be added in a future batch.
   */
  async exportSessionsToPdf(params: {
    type?: string; routerId?: string; username?: string;
    startDate?: string; endDate?: string; mode?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const sessions = await this.fetchSessions(params);
    const routers = await this.prisma.router.findMany();
    const routerMap = new Map(routers.map((r) => [r.nasname, r.name]));
    const tzOffsetMs = getTimezoneOffsetMs();
    const mode = params.mode || 'history';

    // Build a simple text-based PDF
    const lines: string[] = [
      `Sessions Export (${mode})`,
      `Generated: ${formatDate(new Date(), tzOffsetMs)}`,
      `Total: ${sessions.length} session(s)`,
      '',
      'No | Username | Router | IP | Start | Duration | Upload | Download',
      '---|----------|--------|----|-------|----------|--------|----------',
    ];

    sessions.forEach((s, idx) => {
      lines.push(
        `${idx + 1} | ${s.username} | ${routerMap.get(s.nasipaddress) || s.nasipaddress} | ${s.framedipaddress || '-'} | ${formatDate(s.acctstarttime, tzOffsetMs)} | ${s.acctsessiontime ? formatDuration(Number(s.acctsessiontime)) : 'N/A'} | ${formatBytes(Number(s.acctinputoctets || 0))} | ${formatBytes(Number(s.acctoutputoctets || 0))}`,
      );
    });

    const text = lines.join('\n');
    const buffer = this.buildSimplePdf(text);
    const dateStr = new Date().toISOString().substring(0, 10);
    const filename = `sessions-${mode}-${dateStr}.pdf`;
    return { buffer, filename };
  }

  /**
   * Fetch session data based on filters — shared by Excel/PDF/JSON exports.
   */
  async fetchSessions(params: {
    type?: string; routerId?: string; username?: string;
    startDate?: string; endDate?: string; mode?: string;
  }) {
    const mode = params.mode || 'history';

    if (mode === 'active') {
      return this.prisma.radacct.findMany({
        where: {
          acctstoptime: null,
          ...(params.username && { username: { contains: params.username } }),
          ...(params.routerId && { nasipaddress: params.routerId }),
        },
        orderBy: { acctstarttime: 'desc' },
      });
    }

    const where: Record<string, unknown> = {};
    if (params.username) where.username = { contains: params.username };
    if (params.routerId) where.nasipaddress = params.routerId;
    if (params.startDate && params.endDate) {
      where.acctstarttime = { gte: new Date(params.startDate), lte: new Date(params.endDate) };
    }

    return this.prisma.radacct.findMany({
      where: where as never,
      orderBy: { acctstarttime: 'desc' },
      take: 5000,
    });
  }

  /**
   * Build a minimal valid PDF from text content.
   * This produces a single-page PDF with the text content.
   */
  private buildSimplePdf(text: string): Buffer {
    // Escape parentheses for PDF strings
    const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const lines = escaped.split('\n');
    const lineCount = lines.length;
    const lineHeight = 12;
    const pageHeight = 792;
    const startY = pageHeight - 50;
    const contentLines: string[] = [];

    let y = startY;
    for (const line of lines) {
      if (y < 50) break; // Single page limit
      contentLines.push(`BT /F1 8 Tf 50 ${y} Td (${line}) Tj ET`);
      y -= lineHeight;
    }

    const contentStream = contentLines.join('\n');
    const contentLength = contentStream.length;

    // Build PDF objects
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`);
    objects.push(`<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }
}
