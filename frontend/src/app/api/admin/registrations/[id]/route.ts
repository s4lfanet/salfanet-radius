import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get registration
    const registration = await prisma.registrationRequest.findUnique({
      where: { id },
      include: {
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

    // Delete associated invoice if exists
    if (registration.invoiceId) {
      await prisma.invoice.delete({
        where: { id: registration.invoiceId },
      });
    }

    // Delete associated PPPoE user if exists
    if (registration.pppoeUserId && registration.pppoeUser) {
      // Delete from RADIUS tables
      await prisma.radcheck.deleteMany({
        where: { username: registration.pppoeUser.username },
      });

      await prisma.radusergroup.deleteMany({
        where: { username: registration.pppoeUser.username },
      });

      await prisma.radreply.deleteMany({
        where: { username: registration.pppoeUser.username },
      });

      // Delete PPPoE user
      await prisma.pppoeUser.delete({
        where: { id: registration.pppoeUserId },
      });
    }

    // Delete registration
    await prisma.registrationRequest.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Registration deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete registration error:', error);
    return NextResponse.json(
      { error: 'Failed to delete registration' },
      { status: 500 }
    );
  }
}
