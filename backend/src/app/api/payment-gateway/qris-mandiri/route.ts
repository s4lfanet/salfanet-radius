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
        qrisDeviceSecret: true,
        qrisUniqueMin: true,
        qrisUniqueMax: true,
      },
    });

    if (!company) {
      return NextResponse.json({
        qrisEnabled: false,
        qrisStaticCode: '',
        qrisMerchantName: '',
        qrisDeviceKey: '',
        qrisUniqueMin: 1,
        qrisUniqueMax: 999,
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
      qrisDeviceSecret: company.qrisDeviceSecret || '',
      qrisUniqueMin: company.qrisUniqueMin ?? 1,
      qrisUniqueMax: company.qrisUniqueMax ?? 999,
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
    const { qrisEnabled, qrisStaticCode, qrisMerchantName, qrisDeviceKey, qrisUniqueMin, qrisUniqueMax, generateSecret } = body;

    // Validate QRIS string if provided
    if (qrisStaticCode && qrisStaticCode.trim()) {
      if (!validateQris(qrisStaticCode.trim())) {
        return NextResponse.json(
          { error: 'QRIS static code tidak valid. Pastikan kode QRIS benar dari bank/merchant.' },
          { status: 400 }
        );
      }
    }

    const company = await prisma.company.findFirst();
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Key and secret: what was sent, else what is stored. A new one is made
    // only when asked for, or when QRIS is on and none exists yet; minting
    // one on every save broke the listener phones already set up.
    const newCredential = () => crypto.randomUUID().replace(/-/g, '');
    let finalDeviceKey: string | null =
      qrisDeviceKey !== undefined ? (String(qrisDeviceKey || '').trim() || null) : company.qrisDeviceKey;
    if (qrisEnabled && !finalDeviceKey) finalDeviceKey = newCredential();

    let finalDeviceSecret: string | null =
      body.qrisDeviceSecret !== undefined ? (String(body.qrisDeviceSecret || '').trim() || null) : company.qrisDeviceSecret;
    if (generateSecret || (qrisEnabled && !finalDeviceSecret)) finalDeviceSecret = newCredential();

    // Validate unique amount range
    const minVal = qrisUniqueMin != null ? Math.max(1, Math.min(999, Number(qrisUniqueMin))) : undefined;
    const maxVal = qrisUniqueMax != null ? Math.max(1, Math.min(999, Number(qrisUniqueMax))) : undefined;
    if (minVal != null && maxVal != null && minVal > maxVal) {
      return NextResponse.json(
        { error: 'Angka unik minimum tidak boleh lebih besar dari maksimum' },
        { status: 400 }
      );
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        qrisEnabled: !!qrisEnabled,
        qrisStaticCode: qrisStaticCode !== undefined ? (qrisStaticCode?.trim() || null) : undefined,
        qrisMerchantName: qrisMerchantName || null,
        qrisDeviceKey: finalDeviceKey,
        qrisDeviceSecret: finalDeviceSecret,
        ...(minVal != null && { qrisUniqueMin: minVal }),
        ...(maxVal != null && { qrisUniqueMax: maxVal }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'QRIS Mandiri config saved successfully',
      qrisDeviceKey: finalDeviceKey,
      qrisDeviceSecret: finalDeviceSecret,
    });
  } catch (error) {
    console.error('Save QRIS Mandiri config error:', error);
    return NextResponse.json(
      { error: 'Failed to save QRIS Mandiri config' },
      { status: 500 }
    );
  }
}
