import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { randomUUID } from 'crypto';
import { generateExcelBuffer } from '@/lib/utils/export';
import ExcelJS from 'exceljs';
import { generateUniqueReferralCode } from '@/server/services/referral.service';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'template') {
      const format = searchParams.get('format') || 'csv';

      // Sample template rows
      const sampleData = [
        {
          username: 'user001',
          password: 'pass123',
          name: 'Budi Santoso',
          phone: '08123456789',
          email: 'budi@example.com',
          address: 'Jl. Merdeka No. 10',
          area: 'Cluster A',
          ipAddress: '10.10.10.2',
          subscriptionType: 'POSTPAID',
          expiredAt: '',
          billingDay: '1',
          latitude: '-6.200000',
          longitude: '106.816666',
        },
        {
          username: 'user002',
          password: 'pass456',
          name: 'Siti Rahayu',
          phone: '08987654321',
          email: 'siti@example.com',
          address: 'Jl. Sudirman No. 5',
          area: '',
          ipAddress: '',
          subscriptionType: 'PREPAID',
          expiredAt: '2026-12-31',
          billingDay: '',
          latitude: '',
          longitude: '',
        },
      ];

      if (format === 'xlsx') {
        const columns = [
          { key: 'username', header: 'Username *', width: 20 },
          { key: 'password', header: 'Password *', width: 18 },
          { key: 'name', header: 'Nama Lengkap *', width: 24 },
          { key: 'phone', header: 'No. Telepon *', width: 18 },
          { key: 'email', header: 'Email', width: 26 },
          { key: 'address', header: 'Alamat', width: 32 },
          { key: 'area', header: 'Area/Wilayah', width: 20 },
          { key: 'ipAddress', header: 'IP Address', width: 16 },
          { key: 'subscriptionType', header: 'Tipe Langganan (POSTPAID/PREPAID)', width: 32 },
          { key: 'expiredAt', header: 'Tanggal Expired (YYYY-MM-DD)', width: 26 },
          { key: 'billingDay', header: 'Hari Tagihan (1-31)', width: 20 },
          { key: 'latitude', header: 'Latitude', width: 14 },
          { key: 'longitude', header: 'Longitude', width: 14 },
        ];
        const buffer = await generateExcelBuffer(sampleData as any, columns, 'PPPoE Template');
        return new NextResponse(Buffer.from(buffer), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="pppoe-users-template.xlsx"',
          },
        });
      }

      // CSV fallback
      const template = `Username *,Password *,Nama Lengkap *,No. Telepon *,Email,Alamat,Area/Wilayah,IP Address,Tipe Langganan (POSTPAID/PREPAID),Tanggal Expired (YYYY-MM-DD),Hari Tagihan (1-31),Latitude,Longitude
user001,pass123,Budi Santoso,08123456789,budi@example.com,Jl. Merdeka No. 10,Cluster A,10.10.10.2,POSTPAID,,1,-6.200000,106.816666
user002,pass456,Siti Rahayu,08987654321,siti@example.com,Jl. Sudirman No. 5,,, PREPAID,2026-12-31,,,`;

      return new NextResponse(template, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="pppoe-users-template.csv"',
        },
      });
    } else if (type === 'export') {
      // Export all users to CSV
      const users = await prisma.pppoeUser.findMany({
        include: {
          profile: true,
          router: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Build CSV content with password
      let csv = 'username,password,name,phone,email,address,ipAddress,status,profile,router,expiredAt,latitude,longitude,createdAt\n';
      
      users.forEach(user => {
        const row = [
          user.username,
          user.password, // Include plaintext password for backup/recovery
          user.name,
          user.phone,
          user.email || '',
          (user.address || '').replace(/,/g, ';'), // Replace commas in address
          user.ipAddress || '',
          user.status,
          user.profile?.name || '',
          user.router?.name || 'Global',
          user.expiredAt ? new Date(user.expiredAt).toISOString().split('T')[0] : '',
          user.latitude || '',
          user.longitude || '',
          new Date(user.createdAt).toISOString().split('T')[0],
        ];
        csv += row.map(field => `"${field}"`).join(',') + '\n';
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="pppoe-users-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Bulk operation error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const profileId = formData.get('pppoeProfileId') as string;
    const routerId = formData.get('routerId') as string | null;

    if (!file || !profileId) {
      return NextResponse.json(
        { error: 'File and profile are required' },
        { status: 400 }
      );
    }

    // Verify profile exists
    const profile = await prisma.pppoeProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Verify router if provided
    if (routerId) {
      const router = await prisma.router.findUnique({
        where: { id: routerId },
      });

      if (!router) {
        return NextResponse.json(
          { error: 'Router not found' },
          { status: 404 }
        );
      }
    }

    // Parse file: support both CSV and XLSX/XLS
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (isExcel) {
      // Parse XLSX using ExcelJS
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer as any);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return NextResponse.json({ error: 'Excel file has no worksheets' }, { status: 400 });
      }

      // Get headers from row 1
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '').trim().toLowerCase();
      });

      // Parse data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header row
        const rowData: Record<string, string> = {};
        let hasData = false;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = headers[colNumber - 1];
          if (key) {
            // Handle date cells — ExcelJS may parse dates as Date objects
            let val = '';
            if (cell.value instanceof Date) {
              val = cell.value.toISOString().split('T')[0];
            } else {
              val = String(cell.value ?? '').trim();
            }
            rowData[key] = val;
            if (val) hasData = true;
          }
        });
        if (hasData) rows.push(rowData);
      });
    } else {
      // Parse CSV
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return NextResponse.json(
          { error: 'CSV file is empty or invalid' },
          { status: 400 }
        );
      }

      headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v =>
          v.replace(/^"|"$/g, '').trim()
        ) || [];
        const rowData: Record<string, string> = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });
        rows.push(rowData);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 });
    }

    // Normalize headers: map Indonesian labels → internal field names
    const headerNormalizeMap: Record<string, string> = {
      // English (existing/fallback)
      'username': 'username',
      'password': 'password',
      'name': 'name',
      'phone': 'phone',
      'email': 'email',
      'address': 'address',
      'ipaddress': 'ipaddress',
      'ip address': 'ipaddress',
      'subscriptiontype': 'subscriptiontype',
      'expiredat': 'expiredat',
      'billingday': 'billingday',
      'latitude': 'latitude',
      'longitude': 'longitude',
      // Indonesian labels (from template)
      'username *': 'username',
      'password *': 'password',
      'nama lengkap *': 'name',
      'nama lengkap': 'name',
      'no. telepon *': 'phone',
      'no. telepon': 'phone',
      'no telepon': 'phone',
      'telepon': 'phone',
      'alamat': 'address',
      'tipe langganan (postpaid/prepaid)': 'subscriptiontype',
      'tipe langganan': 'subscriptiontype',
      'tipe berlangganan (postpaid/prepaid)': 'subscriptiontype',
      'tipe berlangganan': 'subscriptiontype',
      'tanggal expired (yyyy-mm-dd)': 'expiredat',
      'tanggal expired': 'expiredat',
      'hari tagihan (1-31)': 'billingday',
      'hari tagihan': 'billingday',
      'area/wilayah': 'area',
      'area': 'area',
      'wilayah': 'area',
    };
    headers = headers.map(h => headerNormalizeMap[h] ?? h);

    // Required columns check
    const requiredColumns = ['username', 'password', 'name', 'phone'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Kolom wajib tidak ditemukan: ${missingColumns.join(', ')}` },
        { status: 400 }
      );
    }

    // Process data rows
    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];

      try {
        // Validate required fields
        if (!rowData.username || !rowData.password || !rowData.name || !rowData.phone) {
          results.failed++;
          results.errors.push({
            line: i + 2,
            username: rowData.username || 'unknown',
            error: 'Missing required fields (username, password, name, phone)',
          });
          continue;
        }

        // Check if username already exists
        const existingUser = await prisma.pppoeUser.findUnique({
          where: { username: rowData.username },
        });

        if (existingUser) {
          results.failed++;
          results.errors.push({
            line: i + 2,
            username: rowData.username,
            error: 'Username already exists',
          });
          continue;
        }

        // Resolve subscriptionType (POSTPAID default)
        const rawSubType = (rowData.subscriptiontype || '').toUpperCase();
        const subscriptionType = rawSubType === 'PREPAID' ? 'PREPAID' : 'POSTPAID';

        // Create user
        const userData: any = {
          id: randomUUID(),
          username: rowData.username,
          password: rowData.password,
          name: rowData.name,
          phone: rowData.phone,
          email: rowData.email || null,
          address: rowData.address || null,
          ipAddress: rowData.ipaddress || null,
          profileId: profileId,
          routerId: routerId || null,
          status: 'active',
          subscriptionType,
        };

        // billingDay — only meaningful for POSTPAID
        if (rowData.billingday && rowData.billingday !== '') {
          const bd = parseInt(rowData.billingday, 10);
          if (!isNaN(bd) && bd >= 1 && bd <= 31) {
            userData.billingDay = bd;
          }
        }

        // expiredAt — provided for PREPAID users
        if (rowData.expiredat && rowData.expiredat !== '') {
          const d = new Date(rowData.expiredat);
          if (!isNaN(d.getTime())) {
            userData.expiredAt = d;
          }
        }

        // Coordinates
        if (rowData.latitude && rowData.longitude && rowData.latitude !== '' && rowData.longitude !== '') {
          const lat = parseFloat(rowData.latitude);
          const lng = parseFloat(rowData.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            userData.latitude = lat;
            userData.longitude = lng;
          }
        }

        // Area lookup by name
        if (rowData.area && rowData.area.trim() !== '') {
          const areaRec = await (prisma as any).area.findFirst({
            where: { name: { contains: rowData.area.trim() } }
          });
          if (areaRec) userData.areaId = areaRec.id;
        }

        // Generate unique referral code for new user
        userData.referralCode = await generateUniqueReferralCode();

        const newUser = await prisma.pppoeUser.create({
          data: userData,
        });

        // Sync to RADIUS
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${newUser.username}, 'Cleartext-Password', ':=', ${newUser.password})
          ON DUPLICATE KEY UPDATE value = ${newUser.password}
        `;

        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${newUser.username}
        `;

        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${newUser.username}, ${profile.groupName}, 1)
        `;

        // Add static IP if provided
        if (newUser.ipAddress) {
          await prisma.$executeRaw`
            INSERT INTO radreply (username, attribute, op, value)
            VALUES (${newUser.username}, 'Framed-IP-Address', ':=', ${newUser.ipAddress})
            ON DUPLICATE KEY UPDATE value = ${newUser.ipAddress}
          `;
        }

        // Mark as synced
        await prisma.pppoeUser.update({
          where: { id: newUser.id },
          data: { syncedToRadius: true },
        });

        results.success++;
      } catch (error: any) {
        console.error(`Error processing row ${i + 2}:`, error);
        results.failed++;
        results.errors.push({
          line: i + 2,
          username: rowData.username || 'unknown',
          error: error.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import users' },
      { status: 500 }
    );
  }
}
