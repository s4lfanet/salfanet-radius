import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import Papa from 'papaparse';
import { randomBytes } from 'crypto';
import { prisma } from '@/server/db/client';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';

function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

// Download CSV template
export async function GET() {
  const csvTemplate =
    'username,amount,dueDate,notes\n' +
    'pppoe_user01,100000,2025-08-30,Tagihan Agustus\n' +
    'pppoe_user02,150000,2025-08-30,\n';

  return new NextResponse(csvTemplate, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="template-import-invoice.csv"',
    },
  });
}

export async function POST(request: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();

    // Parse CSV
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json(
        { error: 'CSV parse error: ' + parsed.errors[0]?.message },
        { status: 400 }
      );
    }

    const rows = parsed.data;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    // Validate required headers
    const firstRow = rows[0];
    if (!('username' in firstRow) || !('amount' in firstRow)) {
      return NextResponse.json(
        { error: 'CSV must have columns: username, amount (dueDate and notes are optional)' },
        { status: 400 }
      );
    }

    // Get company info for payment links
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || 'http://localhost:3000';

    const results: {
      row: number;
      username: string;
      status: 'success' | 'error';
      invoiceNumber?: string;
      reason?: string;
    }[] = [];

    let importedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based + header row

      const username = (row['username'] || '').trim();
      const amountRaw = (row['amount'] || '').trim().replace(/[^0-9.]/g, '');
      const dueDateRaw = (row['duedate'] || row['due_date'] || row['dueDate'] || '').trim();
      const notes = (row['notes'] || row['note'] || row['keterangan'] || '').trim();

      // Validate required fields
      if (!username) {
        results.push({ row: rowNum, username: '', status: 'error', reason: 'username kosong' });
        continue;
      }
      if (!amountRaw || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
        results.push({ row: rowNum, username, status: 'error', reason: 'amount tidak valid' });
        continue;
      }

      const amount = Math.round(Number(amountRaw));

      // Calculate due date
      let dueDate: Date;
      if (dueDateRaw) {
        dueDate = new Date(dueDateRaw);
        if (isNaN(dueDate.getTime())) {
          results.push({ row: rowNum, username, status: 'error', reason: `dueDate tidak valid: ${dueDateRaw}` });
          continue;
        }
      } else {
        dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }

      // Look up user
      const user = await prisma.pppoeUser.findFirst({
        where: { username },
      });

      if (!user) {
        results.push({ row: rowNum, username, status: 'error', reason: `Username tidak ditemukan: ${username}` });
        continue;
      }

      // Generate invoice number
      const invoiceNumber = generateInvoiceNumber();
      const paymentToken = generatePaymentToken();
      const paymentLink = `${baseUrl}/pay/${paymentToken}`;

      try {
        await prisma.invoice.create({
          data: {
            id: crypto.randomUUID(),
            invoiceNumber,
            userId: user.id,
            customerName: user.name,
            customerPhone: user.phone || null,
            customerUsername: user.username,
            amount,
            dueDate,
            status: 'PENDING',
            paymentToken,
            paymentLink,
            ...(notes ? { notes } : {}),
          },
        });

        results.push({ row: rowNum, username, status: 'success', invoiceNumber });
        importedCount++;
      } catch (err: any) {
        results.push({
          row: rowNum,
          username,
          status: 'error',
          reason: err?.message || 'Gagal membuat invoice',
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      imported: importedCount,
      failed: rows.length - importedCount,
      results,
    });
  } catch (error: any) {
    console.error('Import invoice error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
