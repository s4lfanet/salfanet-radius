/**
 * POST /api/agent/deposit/webhook
 *
 * Kept for the callback URL Duitku and Tripay deposits were created with.
 * It is the general payment webhook: signatures are verified there and the
 * deposit (orderId = deposit id) is settled by the same handler as every
 * other gateway, so a deposit gets one behaviour (balance, Keuangan,
 * agent push, admin notification) whichever gateway paid it.
 */
export { POST } from '@/app/api/payment/webhook/route';

export const dynamic = 'force-dynamic';
