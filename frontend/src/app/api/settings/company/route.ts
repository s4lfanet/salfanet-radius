import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * GET /api/settings/company
 * Get company information (public endpoint for branding)
 */
export async function GET() {
  try {
    const company = await prisma.company.findFirst({
      select: {
        id: true,
        name: true,
        logo: true,
        address: true,
        phone: true,
        email: true,
      }
    });

    return NextResponse.json({
      success: true,
      company: company || {
        name: 'SALFANET RADIUS',
        logo: null,
        address: null,
        phone: null,
        email: null,
      }
    });
  } catch (error) {
    console.error('[API] Failed to fetch company settings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch company settings',
        company: {
          name: 'SALFANET RADIUS',
          logo: null,
          address: null,
          phone: null,
          email: null,
        }
      },
      { status: 500 }
    );
  }
}
