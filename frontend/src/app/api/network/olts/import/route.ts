import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import * as XLSX from 'xlsx';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'File is empty or invalid format' }, { status: 400 });
    }

    const validVendors = ['zte', 'huawei', 'fiberhome', 'bdcom', 'raisecom'];
    const errors: Array<{ row: number; error: string }> = [];
    const imported: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const name = (row.name || row.Name || '').toString().trim();
        const ipAddress = (row.ipAddress || row['IP Address'] || row.ip || '').toString().trim();

        if (!name) { errors.push({ row: rowNum, error: 'Missing required field: name' }); continue; }
        if (!ipAddress) { errors.push({ row: rowNum, error: 'Missing required field: ipAddress' }); continue; }
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress)) {
          errors.push({ row: rowNum, error: `Invalid IP address: "${ipAddress}"` });
          continue;
        }

        const latRaw = row.latitude ?? row.Latitude;
        const lngRaw = row.longitude ?? row.Longitude;
        const latitude  = latRaw  != null ? parseFloat(String(latRaw))  : 0;
        const longitude = lngRaw != null ? parseFloat(String(lngRaw)) : 0;
        if (isNaN(latitude) || isNaN(longitude)) {
          errors.push({ row: rowNum, error: 'Invalid latitude/longitude' });
          continue;
        }

        const vendorRaw = (row.vendor || row.Vendor || 'zte').toString().toLowerCase().trim();
        const vendor = validVendors.includes(vendorRaw) ? vendorRaw : 'zte';

        const existing = await prisma.networkOLT.findFirst({ where: { ipAddress } });
        if (existing) { errors.push({ row: rowNum, error: `OLT with IP "${ipAddress}" already exists` }); continue; }

        const id = nanoid();
        await prisma.networkOLT.create({
          data: {
            id,
            name,
            ipAddress,
            latitude,
            longitude,
            vendor,
            model: (row.model || row.Model || null)?.toString().trim() || null,
            snmpCommunity: (row.snmpCommunity || row['SNMP Community'] || 'public').toString().trim(),
            snmpPort: parseInt(String(row.snmpPort ?? row['SNMP Port'] ?? 161)) || 161,
            telnetPort: parseInt(String(row.telnetPort ?? row['Telnet Port'] ?? 23)) || 23,
            username: (row.username || row.Username || null)?.toString().trim() || null,
            password: (row.password || row.Password || null)?.toString() || null,
            pollingInterval: parseInt(String(row.pollingInterval ?? row['Polling Interval'] ?? 300)) || 300,
            monitoringEnabled: false,
          },
        });

        imported.push(id);
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message ?? 'Unknown error' });
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      imported: imported.length,
      failed: errors.length,
      results: { imported, errors },
    });
  } catch (error: any) {
    console.error('[OLT Import POST]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
