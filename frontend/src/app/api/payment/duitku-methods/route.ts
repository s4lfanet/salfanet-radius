import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amount = parseInt(searchParams.get('amount') || '10000');

    const gateway = await prisma.paymentGateway.findUnique({
      where: { provider: 'duitku' },
      select: {
        isActive: true,
        duitkuMerchantCode: true,
        duitkuApiKey: true,
        duitkuEnvironment: true,
      },
    });

    if (!gateway || !gateway.isActive) {
      return NextResponse.json({ methods: [] });
    }

    const merchantCode = gateway.duitkuMerchantCode || '';
    const apiKey = gateway.duitkuApiKey || '';
    const isSandbox = gateway.duitkuEnvironment === 'sandbox';
    const baseUrl = isSandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant'
      : 'https://passport.duitku.com/webapi/api/merchant';

    // Duitku getPaymentMethod requires: md5(merchantCode + amount + datetime + apiKey)
    const datetime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const signature = crypto
      .createHash('md5')
      .update(`${merchantCode}${amount}${datetime}${apiKey}`)
      .digest('hex');

    try {
      const res = await fetch(`${baseUrl}/paymentmethod/getpaymentmethod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantcode: merchantCode, amount, datetime, signature }),
        signal: AbortSignal.timeout(8000),
      });

      const data = await res.json();

      if (res.ok && data?.paymentFee?.length > 0) {
        const methods = data.paymentFee.map((m: any) => ({
          code: m.paymentMethod,
          name: m.paymentName,
          fee: m.totalFee || 0,
          group: getGroup(m.paymentMethod),
        }));
        return NextResponse.json({ methods });
      }

      // API returned but no methods — return filtered defaults
      console.warn('[Duitku Methods] API returned no paymentFee:', data?.Message || data);
    } catch (apiErr) {
      console.warn('[Duitku Methods] API error, using defaults:', apiErr);
    }

    // Fallback: return safe defaults filtered by amount
    const defaults = getDefaultMethods(amount);
    return NextResponse.json({ methods: defaults });
  } catch (error) {
    console.error('[Duitku Methods] Error:', error);
    return NextResponse.json({ methods: getDefaultMethods(10000) });
  }
}

/** Duitku minimum amounts per channel (sandbox known values) */
const MIN_AMOUNTS: Record<string, number> = {
  BC: 10000, BV: 10000, M2: 10000, I1: 10000, B1: 10000, A1: 10000, BT: 10000,
  FT: 10000, IR: 10000,
  OV: 100, SP: 100, LK: 100, DA: 100,
};

const ALL_DEFAULTS = [
  { code: 'SP', name: 'ShopeePay (QRIS)', group: 'qris' },
  { code: 'OV', name: 'OVO', group: 'ewallet' },
  { code: 'BC', name: 'BCA Virtual Account', group: 'va' },
  { code: 'M2', name: 'Mandiri Virtual Account', group: 'va' },
  { code: 'I1', name: 'BNI Virtual Account', group: 'va' },
  { code: 'B1', name: 'CIMB VA', group: 'va' },
  { code: 'BV', name: 'BSI Virtual Account', group: 'va' },
  { code: 'A1', name: 'ATM Bersama', group: 'va' },
];

function getDefaultMethods(amount: number) {
  return ALL_DEFAULTS.filter(m => amount >= (MIN_AMOUNTS[m.code] || 0));
}

function getGroup(code: string): string {
  const qris = ['SP', 'NQ', 'QRIS'];
  const ewallet = ['OV', 'LK', 'SA', 'SL', 'DA', 'AT'];
  const retail = ['FT', 'IR', 'CE'];
  const va = ['BC', 'BV', 'M2', 'I1', 'B1', 'A1', 'BT', 'VA', 'DK'];
  if (qris.includes(code)) return 'qris';
  if (ewallet.includes(code)) return 'ewallet';
  if (retail.includes(code)) return 'retail';
  if (va.includes(code)) return 'va';
  return 'other';
}
