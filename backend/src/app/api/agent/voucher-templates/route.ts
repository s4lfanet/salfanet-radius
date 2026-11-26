import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requireAgentAuth } from '@/server/middleware/agent-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/voucher-templates
 * Active voucher print templates the admin designed (default first). The agent
 * app lists these and prints with the chosen one.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAgentAuth(request);
  if (!auth.authorized) return auth.response;
  try {
    const templates = await prisma.voucherTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error('[Agent voucher-templates] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
