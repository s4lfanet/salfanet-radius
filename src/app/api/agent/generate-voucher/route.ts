import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { syncVoucherToRadius } from '@/server/services/radius/hotspot-sync.service';
import { logActivity } from '@/server/services/activity-log.service';
import { nowWIB } from '@/lib/timezone';
import { parseBody } from '@/lib/parse-body';
import { generateVoucherSchema } from '@/features/agents/schemas';

// Code type definitions (same as admin)
const CODE_TYPES: Record<string, { chars: string }> = {
  'alpha-upper': { chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ' },
  'alpha-lower': { chars: 'abcdefghjklmnpqrstuvwxyz' },
  'numeric': { chars: '123456789' },
  'alphanumeric-upper': { chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789' },
};

// POST - Generate voucher by agent
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, generateVoucherSchema);
    if (parsed.error) return parsed.error;
    const { agentId, profileId, quantity, codeLength, codeType, prefix } = parsed.data;

    // Verify agent and get router info
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        router: {
          select: {
            id: true,
            name: true,
            nasname: true,
          },
        },
      },
    });

    if (!agent || !agent.isActive) {
      return NextResponse.json(
        { error: 'Agent not found or inactive' },
        { status: 403 }
      );
    }

    // Check if agent has router assigned
    if (!agent.routerId) {
      return NextResponse.json(
        { error: 'Agent does not have a router assigned. Please contact admin.' },
        { status: 400 }
      );
    }

    // Verify profile and check agentAccess
    const profile = await prisma.hotspotProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.agentAccess) {
      return NextResponse.json(
        { error: 'This profile is not available for agents' },
        { status: 403 }
      );
    }

    // Calculate total cost (costPrice per voucher)
    const totalCost = profile.costPrice * quantity;

    // Check agent balance
    if (agent.balance < totalCost) {
      return NextResponse.json(
        { 
          error: 'Insufficient balance', 
          required: totalCost,
          current: agent.balance,
          deficit: totalCost - agent.balance
        },
        { status: 400 }
      );
    }

    // Check minimum balance requirement
    if (agent.balance - totalCost < agent.minBalance) {
      return NextResponse.json(
        { 
          error: `Balance cannot go below minimum balance of ${agent.minBalance}`,
          required: totalCost + agent.minBalance,
          current: agent.balance
        },
        { status: 400 }
      );
    }

    // Generate batch code: AGENTNAME-TIMESTAMP
    const batchCode = `${agent.name.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now()}`;
    
    // Generate vouchers
    const vouchers = [];

    for (let i = 0; i < quantity; i++) {
      // Generate unique code
      const code = generateVoucherCode(codeLength, prefix, codeType);

      // Create voucher with batch code, agentId, and routerId
      const voucher = await prisma.hotspotVoucher.create({
        data: {
          id: crypto.randomUUID(),
          code,
          profileId: profile.id,
          routerId: agent.routerId, // Link voucher to agent's router
          agentId: agentId, // Link voucher to agent
          batchCode: batchCode,
          status: 'WAITING',
        },
      });

      vouchers.push(voucher);
    }

    // Deduct balance from agent
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        balance: {
          decrement: totalCost,
        },
      },
    });

    // Record agent sales immediately (agent has paid costPrice)
    // resellerFee is agent's profit margin (sellingPrice - costPrice)
    for (const voucher of vouchers) {
      try {
        await prisma.agentSale.create({
          data: {
            id: crypto.randomUUID(),
            agentId: agentId,
            voucherCode: voucher.code,
            profileName: profile.name,
            amount: profile.resellerFee, // Agent profit per voucher
            createdAt: nowWIB(),
          },
        });
      } catch (saleError) {
        console.error(`Failed to record sale for ${voucher.code}:`, saleError);
      }
    }

    // Auto-sync to RADIUS — inline logic matching admin route exactly
    // Uses vouchers already in memory + profile data to avoid re-fetch issues
    let syncSuccessCount = 0;
    let syncFailCount = 0;
    for (const voucher of vouchers) {
      try {
        const password = voucher.code; // hotspot: username = password = code
        const groupProfile = profile.groupProfile || profile.name;
        await syncVoucherToRadius(voucher.code, password, groupProfile);
        syncSuccessCount++;
      } catch (syncError: any) {
        syncFailCount++;
        console.error(`[RADIUS SYNC] Failed for voucher ${voucher.code}: ${syncError?.message}`);
      }
    }
    console.log(`[RADIUS SYNC] Agent batch ${batchCode}: ${syncSuccessCount} OK, ${syncFailCount} failed`);
    if (syncFailCount > 0) {
      console.error(`[RADIUS SYNC] ${syncFailCount} voucher(s) failed to sync for agent ${agent.name}`);
    }

    // Get updated agent balance
    const updatedAgent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { balance: true },
    });

    // Create notification for agent
    await prisma.agentNotification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        agentId: agentId,
        type: 'voucher_generated',
        title: 'Voucher Berhasil Dibuat',
        message: `${quantity} voucher ${profile.name} berhasil dibuat. Biaya: Rp ${totalCost.toLocaleString('id-ID')}. Saldo: Rp ${(updatedAgent?.balance || 0).toLocaleString('id-ID')}`,
        link: null,
      },
    });

    // Create notification for admin about agent voucher generation
    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        type: 'agent_voucher_generated',
        title: 'Agent Generate Voucher',
        message: `${agent.name} generate ${quantity} voucher ${profile.name} (Total: Rp ${totalCost.toLocaleString('id-ID')})`,
        link: '/admin/hotspot/agent',
        createdAt: nowWIB(),
      },
    });

    // Check if balance is low (below minimum + 20%)
    const lowBalanceThreshold = agent.minBalance * 1.2;
    if ((updatedAgent?.balance || 0) < lowBalanceThreshold) {
      await prisma.agentNotification.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          agentId: agentId,
          type: 'low_balance',
          title: 'Saldo Menipis',
          message: `Saldo Anda: Rp ${(updatedAgent?.balance || 0).toLocaleString('id-ID')}. Segera top up untuk terus generate voucher.`,
          link: null,
        },
      });
    }

    // Log activity
    try {
      await logActivity({
        username: agent.name,
        userRole: 'AGENT',
        action: 'AGENT_GENERATE_VOUCHER',
        description: `Agent ${agent.name} generated ${quantity} vouchers (${profile.name})`,
        module: 'agent',
        status: 'success',
        metadata: {
          agentId: agent.id,
          quantity,
          profileName: profile.name,
          costPrice: totalCost,
          newBalance: updatedAgent?.balance || 0,
          batchCode,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      vouchers,
      batchCode,
      cost: totalCost,
      newBalance: updatedAgent?.balance || 0,
      message: `${vouchers.length} vouchers generated. Balance deducted: ${totalCost}`,
    });
  } catch (error) {
    console.error('Generate voucher error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateVoucherCode(length: number = 6, prefix: string = '', codeType: string = 'alpha-upper'): string {
  const chars = CODE_TYPES[codeType]?.chars || CODE_TYPES['alpha-upper'].chars;
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
