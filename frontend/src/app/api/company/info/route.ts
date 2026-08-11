import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const company = await prisma.company.findFirst({
      select: {
        name: true,
        phone: true,
        email: true,
        address: true,
        logo: true,
        isolationMessage: true,
        bankAccounts: true,
      }
    });

    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: company
    });
  } catch (error: any) {
    console.error('Get company info error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
