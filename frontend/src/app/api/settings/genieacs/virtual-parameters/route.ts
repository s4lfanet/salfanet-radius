import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parameters = await prisma.genieacsVirtualParameter.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: parameters });
  } catch (error) {
    console.error('Error fetching virtual parameters:', error);
    return NextResponse.json({ success: false, error: 'Failed to load virtual parameters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { 
      name, parameter, expression, description, isActive = true,
      displayType = 'card', displayOrder = 0, icon, color = 'purple',
      category, unit, showInSummary = true
    } = body;

    if (!name || !parameter || !expression) {
      return NextResponse.json({ success: false, error: 'Name, parameter, and expression are required' }, { status: 400 });
    }

    const created = await prisma.genieacsVirtualParameter.create({
      data: {
        id: nanoid(),
        name,
        parameter,
        expression,
        displayType,
        displayOrder,
        icon: icon || null,
        color: color || null,
        category: category || null,
        unit: unit || null,
        showInSummary,
        description: description || null,
        isActive: !!isActive,
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    console.error('Error creating virtual parameter:', error);
    const message = error?.code === 'P2002' ? 'Parameter must be unique' : 'Failed to create virtual parameter';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
