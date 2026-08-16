import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { validateQris, extractMerchantInfo } from '@/lib/qris';

export const dynamic = 'force-dynamic';

// GET - Get QRIS Mandiri config
export async function GET() {
  const authCheck = await requirePermission('settings.payment');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const company = await prisma.company.findFirst({
      select: {
        qrisEnabled: true,
        qrisStaticCode: true,
        qrisMerchantName: true,
        qrisDeviceKey: true,
      },
    });

    if (!company) {
      return NextResponse.json({
        qrisEnabled: false,
        qrisStaticCode: '',
        qrisMerchantName: '',
        qrisDeviceKey: '',
      });
    }

    // Don't return the full static code — just whether it's set
    const hasStaticCode = !!company.qrisStaticCode;
    const merchantInfo = hasStaticCode ? extractMerchantInfo(company.qrisStaticCode!) : null;

    return NextResponse.json({
      qrisEnabled: company.qrisEnabled || false,
      qrisStaticCode: company.qrisStaticCode || '',
      qrisMerchantName: company.qrisMerchantName || merchantInfo?.merchantName || '',
      qrisDeviceKey: company.qrisDeviceKey || '',
      isValid: hasStaticCode ? validateQris(company.qrisStaticCode!) : false,
      merchantInfo,
    });
  } catch (error) {
    console.error('Get QRIS Mandiri config error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QRIS Mandiri config' },
      { status: 500 }
    );
  }
}

// POST - Save QRIS Mandiri config
export async function POST(request: Request) {
  const authCheck = await requirePermission('settings.payment');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const body = await request.json();
    const { qrisEnabled, qrisStaticCode, qrisMerchantName, qrisDeviceKey } = body;

    // Validate QRIS string if provided
    if (qrisStaticCode && qrisStaticCode.trim()) {
      if (!validateQris(qrisStaticCode.trim())) {
        return NextResponse.json(
          { error: 'QRIS static code tidak valid. Pastikan kode QRIS benar dari bank/merchant.' },
          { status: 400 }
        );
      }
    }

    // Generate device key if enabling and not set
    let finalDeviceKey = qrisDeviceKey;
    if (qrisEnabled && !finalDeviceKey) {
      finalDeviceKey = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    }

    const company = await prisma.company.findFirst();
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        qrisEnabled: !!qrisEnabled,
        qrisStaticCode: qrisStaticCode !== undefined ? (qrisStaticCode?.trim() || null) : undefined,
        qrisMerchantName: qrisMerchantName || null,
        qrisDeviceKey: finalDeviceKey || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'QRIS Mandiri config saved successfully',
      qrisDeviceKey: finalDeviceKey,
    });
  } catch (error) {
    console.error('Save QRIS Mandiri config error:', error);
    return NextResponse.json(
      { error: 'Failed to save QRIS Mandiri config' },
      { status: 500 }
    );
  }
}
