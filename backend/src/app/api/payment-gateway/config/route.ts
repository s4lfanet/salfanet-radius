import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export const dynamic = 'force-dynamic';

// GET - Get all payment gateway configs
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const configs = await prisma.paymentGateway.findMany({
      select: {
        id: true,
        provider: true,
        name: true,
        isActive: true,
        midtransClientKey: true,
        midtransServerKey: true,
        midtransEnvironment: true,
        xenditApiKey: true,
        xenditWebhookToken: true,
        xenditEnvironment: true,
        duitkuMerchantCode: true,
        duitkuApiKey: true,
        duitkuEnvironment: true,
        tripayMerchantCode: true,
        tripayApiKey: true,
        tripayPrivateKey: true,
        tripayEnvironment: true,
      }
    });

    return NextResponse.json(configs);
  } catch (error) {
    console.error('Get payment gateway configs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment gateway configs' },
      { status: 500 }
    );
  }
}

// POST - Create or update payment gateway config
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, ...data } = body;

    console.log('[Payment Gateway Config] Save request:', { provider, data });

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }

    // Check if config exists
    const existing = await prisma.paymentGateway.findUnique({
      where: { provider }
    });

    console.log('[Payment Gateway Config] Existing config:', existing ? 'Found' : 'Not found');

    let config;

    if (existing) {
      // Update existing config
      console.log('[Payment Gateway Config] Updating config for:', provider);
      config = await prisma.paymentGateway.update({
        where: { provider },
        data
      });
      console.log('[Payment Gateway Config] Updated successfully, isActive:', config.isActive);
    } else {
      // Create new config
      console.log('[Payment Gateway Config] Creating new config for:', provider);
      config = await prisma.paymentGateway.create({
        data: {
          id: crypto.randomUUID(),
          provider,
          name: provider.charAt(0).toUpperCase() + provider.slice(1),
          ...data
        }
      });
      console.log('[Payment Gateway Config] Created successfully, isActive:', config.isActive);
    }

    // Verify save
    const verify = await prisma.paymentGateway.findUnique({
      where: { provider },
      select: { id: true, provider: true, isActive: true }
    });
    console.log('[Payment Gateway Config] Verification after save:', verify);

    return NextResponse.json(config);
  } catch (error) {
    console.error('Save payment gateway config error:', error);
    return NextResponse.json(
      { error: 'Failed to save payment gateway config' },
      { status: 500 }
    );
  }
}
