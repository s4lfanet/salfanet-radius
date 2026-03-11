import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/server/auth/config';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create template data
    const templateData = [
      {
        code: 'JC-001',
        name: 'JC Renon 001',
        type: 'CORE',
        cableType: 'SM-24C',
        fiberCount: 24,
        latitude: -8.670458,
        longitude: 115.212629,
        status: 'active',
        splitterRatio: '1:16',
        address: 'Jl. Raya Renon',
      },
      {
        code: 'JC-002',
        name: 'JC Gatsu 001',
        type: 'DISTRIBUTION',
        cableType: 'SM-12C',
        fiberCount: 12,
        latitude: -8.671234,
        longitude: 115.213456,
        status: 'active',
        splitterRatio: '1:8',
        address: 'Jl. Gatsu',
      },
    ];

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'JointClosures');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 10 }, // code
      { wch: 20 }, // name
      { wch: 15 }, // type
      { wch: 12 }, // cableType
      { wch: 12 }, // fiberCount
      { wch: 12 }, // latitude
      { wch: 12 }, // longitude
      { wch: 10 }, // status
      { wch: 12 }, // splitterRatio
      { wch: 25 }, // address
    ];

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="JointClosures_Import_Template.xlsx"',
      },
    });

  } catch (error: any) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: 500 }
    );
  }
}
