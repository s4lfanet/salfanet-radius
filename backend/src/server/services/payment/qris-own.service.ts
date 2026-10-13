import 'server-only'
import crypto from 'crypto';
import { prisma } from '@/server/db/client';
import { staticToDynamic, generateUniqueAmountSafeAsync } from '@/lib/qris';

const QRIS_TTL_MS = 15 * 60 * 1000;

export class QrisUnavailableError extends Error {}

export interface QrisPayment {
  orderId: string;
  qrString: string;
  baseAmount: number;
  uniqueAmount: number;
  expiresAt: Date;
  /** Hosted page that shows the QR and follows the payment. */
  paymentUrl: string;
}

/**
 * QRIS Mandiri as an entry in a payment-gateway list, or null when it is not
 * set up. It is not a paymentGateway row, so lists add it explicitly.
 */
export async function qrisOwnOption() {
  if (!(await qrisOwnAvailable())) return null;
  return { id: 'qris_own', name: 'QRIS (semua e-wallet & m-banking)', provider: 'qris_own', isActive: true };
}

/** Whether QRIS Mandiri is set up, for offering it as a payment option. */
export async function qrisOwnAvailable(): Promise<boolean> {
  const company = await prisma.company.findFirst({ select: { qrisEnabled: true, qrisStaticCode: true } });
  return !!company?.qrisEnabled && !!company.qrisStaticCode;
}

/**
 * Creates a QRIS Mandiri payment for any order. The orderId decides what
 * is settled when the payment arrives (see settleOrder): INV- invoice,
 * EVC- voucher order, TOPUP- balance top-up, or an agent deposit id.
 *
 * The QR is dynamic: the amount (bill + a unique 1-999 code) is inside it,
 * so the payer cannot type a different number. An unexpired QR for the
 * same order is reused instead of creating a second one.
 */
export async function createQrisPayment(params: {
  orderId: string;
  baseAmount: number;
  invoiceId?: string | null;
  userId?: string | null;
  /** Relative path the QR page links back to after payment. */
  returnPath?: string;
}): Promise<QrisPayment> {
  const company = await prisma.company.findFirst({
    select: { qrisEnabled: true, qrisStaticCode: true, qrisUniqueMin: true, qrisUniqueMax: true, baseUrl: true },
  });
  if (!company?.qrisEnabled || !company.qrisStaticCode) {
    throw new QrisUnavailableError('QRIS Mandiri belum dikonfigurasi. Buka Admin → Payment Gateway → QRIS Mandiri.');
  }

  const base = (company.baseUrl || '').replace(/\/+$/, '');
  const back = params.returnPath && params.returnPath.startsWith('/') && !params.returnPath.startsWith('//') ? params.returnPath : '';
  const pageUrl = (orderId: string) =>
    `${base}/pay/qris/${encodeURIComponent(orderId)}${back ? `?back=${encodeURIComponent(back)}` : ''}`;

  const now = new Date();
  const existing = await prisma.qrisPending.findUnique({ where: { orderId: params.orderId } });
  if (existing?.status === 'pending' && existing.expiresAt > new Date(now.getTime() + 60_000) && existing.baseAmount === params.baseAmount) {
    return {
      orderId: existing.orderId,
      qrString: existing.qrString,
      baseAmount: existing.baseAmount,
      uniqueAmount: existing.uniqueAmount,
      expiresAt: existing.expiresAt,
      paymentUrl: pageUrl(existing.orderId),
    };
  }
  if (existing?.status === 'paid') {
    throw new QrisUnavailableError('Pesanan ini sudah dibayar.');
  }

  const uniqueAmount = await generateUniqueAmountSafeAsync(
    params.baseAmount,
    params.orderId,
    async (amt) =>
      !!(await prisma.qrisPending.findFirst({
        where: { uniqueAmount: amt, status: 'pending', expiresAt: { gt: new Date() }, NOT: { orderId: params.orderId } },
        select: { id: true },
      })),
    company.qrisUniqueMin ?? 1,
    company.qrisUniqueMax ?? 999,
  );
  const qrString = staticToDynamic(company.qrisStaticCode, uniqueAmount);
  const expiresAt = new Date(now.getTime() + QRIS_TTL_MS);
  const data = {
    invoiceId: params.invoiceId ?? null,
    userId: params.userId ?? null,
    baseAmount: params.baseAmount,
    uniqueAmount,
    qrString,
    status: 'pending',
    expiresAt,
    sourceApp: null,
    paidAt: null,
  };

  // An expired QR for the same order is replaced in place (orderId is unique).
  await prisma.qrisPending.upsert({
    where: { orderId: params.orderId },
    update: data,
    create: { id: crypto.randomUUID(), orderId: params.orderId, ...data },
  });

  try {
    await prisma.webhookLog.create({
      data: {
        id: crypto.randomUUID(),
        gateway: 'qris_own',
        orderId: params.orderId,
        status: 'pending',
        amount: uniqueAmount,
        payload: JSON.stringify({ type: 'qris_own', baseAmount: params.baseAmount, uniqueAmount }),
        success: true,
      },
    });
  } catch (e) {
    console.error('[QRIS] webhook log failed:', e);
  }

  return { orderId: params.orderId, qrString, baseAmount: params.baseAmount, uniqueAmount, expiresAt, paymentUrl: pageUrl(params.orderId) };
}
