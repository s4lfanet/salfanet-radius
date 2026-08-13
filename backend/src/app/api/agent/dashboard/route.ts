import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { toWIB, nowWIB, WIB_TIMEZONE } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '@/server/db/client';
import { requireAgentAuth } from '@/server/middleware/agent-auth';

// GET - Get agent dashboard data
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const { searchParams } = new URL(request.url);
    // Pagination & filter params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const profileId = searchParams.get('profileId') || '';

    // Get agent and update lastLogin
    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: { lastLogin: nowWIB() },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Build voucher filter
    const voucherWhere: Prisma.hotspotVoucherWhereInput = {
      agentId: agentId,
    };
    
    if (status && status !== 'ALL') {
      voucherWhere.status = status as any;
    }
    
    if (search) {
      voucherWhere.code = { contains: search };
    }
    
    if (profileId) {
      voucherWhere.profileId = profileId;
    }

    // Get total count for pagination
    const totalVouchers = await prisma.hotspotVoucher.count({
      where: voucherWhere,
    });

    // Get paginated vouchers
    const allVouchers = await prisma.hotspotVoucher.findMany({
      where: voucherWhere,
      include: {
        profile: true,
        router: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    
    // Get all vouchers for stats (without pagination)
    const allVouchersForStats = await prisma.hotspotVoucher.findMany({
      where: { agentId: agentId },
      include: { profile: true },
    });

    // Calculate statistics from all vouchers (not paginated)
    // Use WIB timezone for month calculation (UTC stored in DB)
    const now = nowWIB();
    const currentMonth = now.getUTCMonth();
    const currentYear = now.getUTCFullYear();

    // Calculate voucher statistics based on status
    const soldVouchers = allVouchersForStats.filter((v) => v.status === 'SOLD' || v.status === 'ACTIVE' || v.status === 'EXPIRED');
    const usedVouchers = allVouchersForStats.filter((v) => v.status === 'ACTIVE' || v.status === 'EXPIRED');
    
    // Current month sold vouchers - Compare using UTC methods (WIB-as-UTC)
    const currentMonthSold = soldVouchers.filter((v) => {
      const usedDate = v.firstLoginAt ? toWIB(v.firstLoginAt) : null;
      if (!usedDate) return false;
      return (
        usedDate.getUTCMonth() === currentMonth &&
        usedDate.getUTCFullYear() === currentYear
      );
    });
    
    // Calculate income from sold vouchers (use sellingPrice)
    const currentMonthIncome = currentMonthSold.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);
    const allTimeIncome = soldVouchers.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);
    
    // Calculate commission earned (resellerFee from sold vouchers)
    const currentMonthCommission = currentMonthSold.reduce((sum, v) => sum + (v.profile?.resellerFee || 0), 0);
    const allTimeCommission = soldVouchers.reduce((sum, v) => sum + (v.profile?.resellerFee || 0), 0);

    // Calculate today's sales - Compare date only (WIB-as-UTC)
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    
    const todaySold = soldVouchers.filter((v) => {
      const usedDate = v.firstLoginAt ? toWIB(v.firstLoginAt) : null;
      if (!usedDate) return false;
      return usedDate >= todayStart && usedDate < todayEnd;
    });
    
    const todayIncome = todaySold.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);
    const todayCommission = todaySold.reduce((sum, v) => sum + (v.profile?.resellerFee || 0), 0);

    const stats = {
      currentMonth: {
        total: currentMonthCommission, // Commission agent bulan ini
        count: currentMonthSold.length, // Voucher terjual bulan ini
        income: currentMonthIncome, // Total penjualan bulan ini
      },
      allTime: {
        total: allTimeCommission, // Total komisi agent
        count: soldVouchers.length, // Total voucher terjual
        income: allTimeIncome, // Total penjualan sepanjang waktu
      },
      today: {
        total: todayCommission, // Commission hari ini
        count: todaySold.length, // Voucher terjual hari ini
        income: todayIncome, // Total penjualan hari ini
      },
      generated: allVouchersForStats.length,
      waiting: allVouchersForStats.filter((v) => v.status === 'WAITING').length,
      sold: soldVouchers.length,
      used: usedVouchers.length,
    };

    // Get profiles with agentAccess enabled
    const profiles = await prisma.hotspotProfile.findMany({
      where: {
        agentAccess: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get recent deposits
    const deposits = await prisma.agentDeposit.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Get active payment gateways for deposit
    const paymentGateways = await prisma.paymentGateway.findMany({
      where: { isActive: true },
      select: {
        provider: true,
        name: true,
      },
    });

    // Parse speed string (e.g. "10M/5M") to downloadSpeed / uploadSpeed numbers
    const parseSpeed = (speed: string | null) => {
      if (!speed) return { downloadSpeed: 0, uploadSpeed: 0 };
      const part = speed.split(' ')[0]; // take first segment before space
      const [dl, ul] = part.split('/');
      const parse = (s: string | undefined) => {
        if (!s) return 0;
        const n = parseInt(s.replace(/[^0-9]/g, '')) || 0;
        return s.toLowerCase().includes('k') ? Math.ceil(n / 1000) : n;
      };
      return { downloadSpeed: parse(dl), uploadSpeed: parse(ul) };
    };

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        balance: agent.balance,
        minBalance: agent.minBalance,
        lastLogin: agent.lastLogin,
        voucherStock: stats.waiting,
      },
      stats,
      profiles: profiles.map((p) => ({ ...p, ...parseSpeed(p.speed) })),
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: d.amount,
        status: d.status,
        paymentGateway: d.paymentGateway,
        paymentUrl: d.paymentUrl,
        targetBankName: d.targetBankName,
        targetBankAccountNumber: d.targetBankAccountNumber,
        targetBankAccountName: d.targetBankAccountName,
        senderAccountName: d.senderAccountName,
        senderAccountNumber: d.senderAccountNumber,
        receiptImage: d.receiptImage,
        note: d.note,
        paidAt: d.paidAt,
        expiredAt: d.expiredAt,
        createdAt: d.createdAt,
      })),
      paymentGateways: paymentGateways.map((g) => ({
        provider: g.provider,
        name: g.name,
      })),
      vouchers: allVouchers.map((v) => ({
        id: v.id,
        code: v.code,
        batchCode: v.batchCode,
        status: v.status,
        profileName: v.profile?.name || 'Unknown',
        sellingPrice: v.profile?.sellingPrice || 0,
        resellerFee: v.profile?.resellerFee || 0,
        routerName: v.router?.name || null,
        firstLoginAt: v.firstLoginAt ? v.firstLoginAt.toISOString().replace('Z', '') : null,
        expiresAt: v.expiresAt ? v.expiresAt.toISOString().replace('Z', '') : null,
        createdAt: formatInTimeZone(v.createdAt, WIB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      })),
      pagination: {
        page,
        limit,
        total: totalVouchers,
        totalPages: Math.ceil(totalVouchers / limit),
      },
    });
  } catch (error) {
    console.error('Get agent dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
