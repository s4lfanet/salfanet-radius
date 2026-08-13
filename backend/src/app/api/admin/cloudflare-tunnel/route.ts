import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const company = await prisma.company.findFirst();

    return NextResponse.json({
      baseUrl: company?.baseUrl || '',
      envNextauthUrl: process.env.NEXTAUTH_URL || '',
      envAppUrl: process.env.NEXT_PUBLIC_APP_URL || '',
    });
  } catch (error) {
    console.error('CF tunnel GET error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tunnelDomain } = await req.json();

    if (!tunnelDomain || typeof tunnelDomain !== 'string') {
      return NextResponse.json({ error: 'tunnelDomain is required' }, { status: 400 });
    }

    // Normalize: ensure https:// prefix, no trailing slash
    let baseUrl = tunnelDomain.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const company = await prisma.company.findFirst();
    if (!company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 404 });
    }

    await prisma.company.update({
      where: { id: company.id },
      data: { baseUrl },
    });

    return NextResponse.json({ success: true, baseUrl });
  } catch (error) {
    console.error('CF tunnel POST error:', error);
    return NextResponse.json({ error: 'Failed to save tunnel domain' }, { status: 500 });
  }
}
