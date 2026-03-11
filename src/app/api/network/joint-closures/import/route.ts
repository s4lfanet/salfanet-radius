import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import * as XLSX from 'xlsx';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file uploaded',
      }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'File is empty or invalid format',
      }, { status: 400 });
    }

    const errors: string[] = [];
    const imported: any[] = [];

    // Validate JC types
    const validTypes = ['CORE', 'DISTRIBUTION', 'FEEDER'];
    const validCableTypes = ['SM-12C', 'SM-24C', 'SM-48C', 'SM-96C'];

    console.log('Processing', data.length, 'rows from Excel');

    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      const rowNum = i + 2; // Excel row number (accounting for header)

      try {
        console.log(`Processing row ${rowNum}:`, row);

        // Required fields - check for both 'Code' and 'code', 'Name' and 'name'
        const code = row.Code || row.code;
        const name = row.Name || row.name;
        
        if (!code || !name) {
          errors.push(`Row ${rowNum}: Missing required fields (code or name). Found code="${code}", name="${name}"`);
          continue;
        }

        // Validate type - be more flexible with casing
        const typeValue = row.Type || row.type || 'CORE';
        const jcType = typeValue.toString().toUpperCase();
        if (!validTypes.includes(jcType)) {
          errors.push(`Row ${rowNum}: Invalid JC type "${typeValue}". Must be: CORE, DISTRIBUTION, or FEEDER`);
          continue;
        }

        // Validate cable type - be more flexible
        const cableTypeValue = row['Cable Type'] || row.cableType || row.CableType || 'SM-24C';
        const cableType = cableTypeValue.toString();
        if (!validCableTypes.includes(cableType)) {
          errors.push(`Row ${rowNum}: Invalid cable type "${cableTypeValue}". Must be: SM-12C, SM-24C, SM-48C, or SM-96C`);
          continue;
        }

        // Validate fiber count - check multiple column names
        const fiberCountValue = row['Fiber Count'] || row.fiberCount || row.FiberCount || 24;
        const fiberCount = parseInt(fiberCountValue.toString()) || 24;
        if (fiberCount < 2 || fiberCount > 96) {
          errors.push(`Row ${rowNum}: Fiber count must be between 2 and 96`);
          continue;
        }

        // Validate GPS coordinates (required in schema)
        let latitude: number = -8.670458; // Default Bali coordinates
        let longitude: number = 115.212629;

        const latValue = row.Latitude || row.latitude;
        const lngValue = row.Longitude || row.longitude;

        if (latValue && lngValue) {
          const parsedLat = parseFloat(latValue.toString());
          const parsedLng = parseFloat(lngValue.toString());

          if (isNaN(parsedLat) || isNaN(parsedLng)) {
            errors.push(`Row ${rowNum}: Invalid GPS coordinates`);
            continue;
          }

          if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
            errors.push(`Row ${rowNum}: GPS coordinates out of range`);
            continue;
          }

          latitude = parsedLat;
          longitude = parsedLng;
        }

        // Check for duplicates
        const existing = await prisma.network_joint_closures.findFirst({
          where: { code },
        });

        if (existing) {
          errors.push(`Row ${rowNum}: Joint Closure with code "${code}" already exists`);
          continue;
        }

        // Get other fields with flexible column names
        const address = row.Address || row.address || null;
        const splitterRatio = row['Splitter Ratio'] || row.splitterRatio || row.SplitterRatio || null;
        const status = row.Status || row.status || 'active';
        const installDate = row['Install Date'] || row.installDate || row.InstallDate;

        // Prepare connections JSON (empty for now)
        const connections: any[] = [];

        console.log(`Creating JC for row ${rowNum}:`, {
          code,
          name,
          type: jcType,
          latitude,
          longitude,
          cableType,
          fiberCount,
        });

        // Insert to network_joint_closures
        const jc = await prisma.network_joint_closures.create({
          data: {
            id: nanoid(),
            code,
            name,
            type: jcType,
            latitude,
            longitude,
            address,
            cableType,
            fiberCount,
            connections,
            hasSplitter: !!splitterRatio,
            splitterRatio,
            status,
            followRoad: true,
            installDate: installDate ? new Date(installDate) : null,
          },
        });

        console.log(`Created JC ${jc.id} successfully`);

        // Also insert to network_nodes (unified table for topology)
        await prisma.network_nodes.create({
          data: {
            id: jc.id,
            code: jc.code,
            name: jc.name,
            type: 'JOINT_CLOSURE',
            latitude,
            longitude,
            status: (jc.status || 'active') as 'active' | 'inactive' | 'maintenance' | 'damaged',
            metadata: {
              legacyId: jc.id,
              cableType,
              fiberCount,
              splitterRatio: splitterRatio || '',
              address: address || '',
            },
          },
        });

        imported.push(jc);
      } catch (err: any) {
        console.error(`Error processing row ${rowNum}:`, err);
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    console.log('Import completed:', {
      totalRows: data.length,
      imported: imported.length,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      imported: imported.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported.length} Joint Closures${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to import file',
    }, { status: 500 });
  }
}
