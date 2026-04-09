import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const profileId = searchParams.get('profileId');
    const monthParam = searchParams.get('month'); // YYYY-MM

    // Build optional month filter for createdAt
    let monthFilter: any = {};
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      monthFilter = {
        createdAt: {
          gte: startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1))),
          lte: endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))),
        },
      };
    }

    // Get all batches with their vouchers grouped
    const batches = await prisma.hotspotVoucher.groupBy({
      by: ['batchCode', 'profileId', 'agentId', 'createdAt'],
      where: {
        batchCode: { not: null },
        ...(agentId && agentId !== 'all' ? { agentId } : {}),
        ...(profileId && profileId !== 'all' ? { profileId } : {}),
        ...monthFilter,
      },
      _count: {
        id: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get voucher counts per batch by status
    const rekapData = await Promise.all(
      batches.map(async (batch: any) => {
        // Count by status
        const statusCounts = await prisma.hotspotVoucher.groupBy({
          by: ['status'],
          where: {
            batchCode: batch.batchCode,
          },
          _count: {
            id: true,
          },
        });

        const waiting = statusCounts.find((s: any) => s.status === 'WAITING')?._count.id || 0;
        const active = statusCounts.find((s: any) => s.status === 'ACTIVE')?._count.id || 0;
        const expired = statusCounts.find((s: any) => s.status === 'EXPIRED')?._count.id || 0;

        // Get profile info
        const profile = await prisma.hotspotProfile.findUnique({
          where: { id: batch.profileId },
          select: { id: true, name: true, sellingPrice: true },
        });

        // Get agent info if exists
        let agent = null;
        if (batch.agentId) {
          agent = await prisma.agent.findUnique({
            where: { id: batch.agentId },
            select: { id: true, name: true, phone: true },
          });
        }

        // Get router info from first voucher in batch
        const sampleVoucher = await prisma.hotspotVoucher.findFirst({
          where: { batchCode: batch.batchCode },
          select: { router: { select: { id: true, name: true } } },
        });

        const sellingPrice = profile?.sellingPrice ?? 0;
        const totalRevenue = (active + expired) * sellingPrice;

        return {
          batchCode: batch.batchCode,
          createdAt: batch.createdAt.toISOString(),
          agent,
          profile: profile || { id: batch.profileId, name: 'Unknown', sellingPrice: 0 },
          router: sampleVoucher?.router || null,
          totalQty: batch._count.id,
          stock: waiting,
          sold: active + expired,
          sellingPrice,
          totalRevenue,
        };
      })
    );

    // Get all agents for filter
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Get all profiles for filter
    const profiles = await prisma.hotspotProfile.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      rekap: rekapData,
      agents,
      profiles,
    });
  } catch (error) {
    console.error('Rekap voucher error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rekap voucher' },
      { status: 500 }
    );
  }
}
