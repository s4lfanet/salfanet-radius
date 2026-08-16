import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('registrations.approve');
    if (!auth.authorized) return auth.response;
    const { id } = await params;

    // Get registration
    const registration = await prisma.registrationRequest.findUnique({
      where: { id },
      include: {
        profile: true,
        pppoeUser: true,
        invoice: true,
      },
    });

    if (!registration) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    if (registration.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Registration must be approved first' },
        { status: 400 }
      );
    }

    if (!registration.pppoeUser) {
      return NextResponse.json(
        { error: 'PPPoE user not created yet' },
        { status: 400 }
      );
    }

    // Update registration status to INSTALLED
    // Invoice already created during approve — no need to create new one
    await prisma.registrationRequest.update({
      where: { id },
      data: {
        status: 'INSTALLED',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Installation marked as done',
      invoice: registration.invoice ? {
        id: registration.invoice.id,
        invoiceNumber: registration.invoice.invoiceNumber,
        amount: registration.invoice.amount,
        status: registration.invoice.status,
        dueDate: registration.invoice.dueDate,
        paymentLink: registration.invoice.paymentLink,
      } : null,
    });
  } catch (error: any) {
    console.error('Mark installed error:', error);
    return NextResponse.json(
      { error: 'Failed to mark installation done' },
      { status: 500 }
    );
  }
}
