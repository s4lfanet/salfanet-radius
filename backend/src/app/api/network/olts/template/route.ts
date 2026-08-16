import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  const templateData = [
    {
      name: 'OLT Denpasar 01',
      ipAddress: '192.168.1.1',
      latitude: -8.670458,
      longitude: 115.212629,
      vendor: 'zte',
      model: 'C320',
      snmpCommunity: 'public',
      snmpPort: 161,
      telnetPort: 23,
      username: 'admin',
      password: 'admin',
      pollingInterval: 300,
    },
    {
      name: 'OLT Badung 01',
      ipAddress: '192.168.2.1',
      latitude: -8.620000,
      longitude: 115.200000,
      vendor: 'huawei',
      model: 'MA5800',
      snmpCommunity: 'public',
      snmpPort: 161,
      telnetPort: 23,
      username: 'admin',
      password: 'admin',
      pollingInterval: 300,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'OLTs');

  worksheet['!cols'] = [
    { wch: 20 }, // name
    { wch: 16 }, // ipAddress
    { wch: 12 }, // latitude
    { wch: 12 }, // longitude
    { wch: 12 }, // vendor
    { wch: 12 }, // model
    { wch: 16 }, // snmpCommunity
    { wch: 10 }, // snmpPort
    { wch: 12 }, // telnetPort
    { wch: 12 }, // username
    { wch: 12 }, // password
    { wch: 16 }, // pollingInterval
  ];

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="OLT_Import_Template.xlsx"',
    },
  });
}
