import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

// Company info is public, read-only, and rarely changes.
// Use veryRelaxed limit (500/min) + Cache-Control so browser/proxy caches it.
export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.veryRelaxed);
  if (limited) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
  }
  try {
    const company = await prisma.company.findFirst({
      select: {
        name: true,
        phone: true,
        email: true,
        address: true,
        logo: true,
        poweredBy: true,
        timezone: true,
        baseUrl: true,
        adminPhone: true,
        footerAdmin: true,
        footerCustomer: true,
        footerTechnician: true,
        footerAgent: true,
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
    }, {
      headers: {
        // Cache for 5 minutes in browser/proxy — company info rarely changes
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error: any) {
    console.error('Get company info error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
