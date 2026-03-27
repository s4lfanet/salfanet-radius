import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { generateExcelBuffer } from '@/lib/utils/export';
import ExcelJS from 'exceljs';

function generateCustomerId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'template') {
    const format = searchParams.get('format') || 'csv';

    const sampleData = [
      {
        name: 'Budi Santoso',
        phone: '08123456789',
        email: 'budi@example.com',
        address: 'Jl. Merdeka No. 10, Jakarta',
        idCardNumber: '3171234567890001',
      },
      {
        name: 'Siti Rahayu',
        phone: '08987654321',
        email: '',
        address: '',
        idCardNumber: '',
      },
    ];

    if (format === 'xlsx') {
      const columns = [
        { key: 'name', header: 'Nama Lengkap *', width: 28 },
        { key: 'phone', header: 'No. HP *', width: 18 },
        { key: 'email', header: 'Email', width: 28 },
        { key: 'address', header: 'Alamat', width: 36 },
        { key: 'idCardNumber', header: 'No. KTP (16 digit)', width: 22 },
      ];
      const buffer = await generateExcelBuffer(sampleData as any, columns, 'Template Pelanggan');
      return new NextResponse(Buffer.from(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="template-customer.xlsx"',
        },
      });
    }

    // CSV fallback
    const csv = `Nama Lengkap *,No. HP *,Email,Alamat,No. KTP (16 digit)
Budi Santoso,08123456789,budi@example.com,"Jl. Merdeka No. 10, Jakarta",3171234567890001
Siti Rahayu,08987654321,,,`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="template-customer.csv"',
      },
    });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return NextResponse.json({ error: 'Empty workbook' }, { status: 400 });
      }
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell, colIdx) => {
        headers[colIdx - 1] = (cell.value?.toString() || '').toLowerCase().trim();
      });
      sheet.eachRow((row, rowIdx) => {
        if (rowIdx === 1) return;
        const rowData: Record<string, string> = {};
        row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
          rowData[headers[colIdx - 1]] = cell.value?.toString()?.trim() || '';
        });
        if (Object.values(rowData).some((v) => v !== '')) rows.push(rowData);
      });
    } else if (fileName.endsWith('.csv')) {
      const text = buffer.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length < 2) {
        return NextResponse.json({ error: 'File CSV kosong' }, { status: 400 });
      }
      headers = lines[0].split(',').map((h) => h.toLowerCase().trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const rowData: Record<string, string> = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });
        rows.push(rowData);
      }
    } else {
      return NextResponse.json({ error: 'Format file tidak didukung. Gunakan CSV atau XLSX.' }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data dalam file' }, { status: 400 });
    }

    // Normalize headers
    const headerMap: Record<string, string> = {
      'nama lengkap *': 'name',
      'nama lengkap': 'name',
      'nama': 'name',
      'name': 'name',
      'no. hp *': 'phone',
      'no. hp': 'phone',
      'no hp': 'phone',
      'telepon': 'phone',
      'phone': 'phone',
      'email': 'email',
      'alamat': 'address',
      'address': 'address',
      'no. ktp (16 digit)': 'idcardnumber',
      'no. ktp': 'idcardnumber',
      'no ktp': 'idcardnumber',
      'ktp': 'idcardnumber',
      'idcardnumber': 'idcardnumber',
    };
    headers = headers.map((h) => headerMap[h] ?? h);
    rows = rows.map((row) => {
      const normalized: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => {
        normalized[headerMap[k] ?? k] = v;
      });
      return normalized;
    });

    const requiredColumns = ['name', 'phone'];
    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Kolom wajib tidak ditemukan: ${missingColumns.join(', ')}` },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name || !row.phone) {
          results.failed++;
          results.errors.push({ line: i + 2, error: 'Nama dan No. HP wajib diisi' });
          continue;
        }

        // Validate KTP if provided
        if (row.idcardnumber && !/^\d{16}$/.test(row.idcardnumber)) {
          results.failed++;
          results.errors.push({ line: i + 2, error: 'No. KTP harus 16 digit angka' });
          continue;
        }

        // Check duplicate phone
        const existing = await (prisma as any).pppoeCustomer.findFirst({
          where: { phone: row.phone },
        });
        if (existing) {
          results.failed++;
          results.errors.push({ line: i + 2, error: `No. HP ${row.phone} sudah terdaftar` });
          continue;
        }

        await (prisma as any).pppoeCustomer.create({
          data: {
            id: generateId(),
            customerId: generateCustomerId(),
            name: row.name,
            phone: row.phone,
            email: row.email || null,
            address: row.address || null,
            idCardNumber: row.idcardnumber || null,
            isActive: true,
          },
        });

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({ line: i + 2, error: error.message || 'Unknown error' });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Customer import error:', error);
    return NextResponse.json({ error: 'Gagal mengimport data' }, { status: 500 });
  }
}
