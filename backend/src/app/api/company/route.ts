import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { setCurrentTimezone } from '@/lib/timezone';

export async function GET() {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const company = await prisma.company.findFirst();
    
    if (!company) {
      // Return default if no company exists
      return NextResponse.json({
        name: 'SALFANET RADIUS',
        email: 'admin@salfanet.com',
        phone: '+62 812-3456-7890',
        address: 'Jakarta, Indonesia',
        baseUrl: 'http://localhost:3000',
        adminPhone: '+62 812-3456-7890',
        timezone: 'Asia/Jakarta',
        logo: null,
        poweredBy: 'SALFANET RADIUS',
        footerAdmin: 'Powered by SALFANET RADIUS',
        footerCustomer: 'Powered by SALFANET RADIUS',
        footerTechnician: 'Powered by SALFANET RADIUS',
        footerAgent: 'Powered by SALFANET RADIUS',
        qrisStaticCode: null,
        qrisMerchantName: null,
        qrisEnabled: false,
        qrisDeviceKey: null,
        qrisDeviceSecret: null,
      });
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const data = await request.json();
    
    // Check if company already exists
    const existingCompany = await prisma.company.findFirst();
    
    // Parse bank accounts if provided
    let bankAccounts = data.bankAccounts;
    if (bankAccounts && typeof bankAccounts === 'string') {
      try {
        bankAccounts = JSON.parse(bankAccounts);
      } catch (e) {
        console.error('Error parsing bank accounts:', e);
        bankAccounts = [];
      }
    }
    
    let company;
    if (existingCompany) {
      // Update existing
      company = await prisma.company.update({
        where: { id: existingCompany.id },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          baseUrl: data.baseUrl,
          adminPhone: data.adminPhone,
          logo: data.logo,
          timezone: data.timezone,
          poweredBy: data.poweredBy,
          customerIdPrefix: data.customerIdPrefix ?? null,
          footerAdmin: data.footerAdmin,
          footerCustomer: data.footerCustomer,
          footerTechnician: data.footerTechnician,
          footerAgent: data.footerAgent,
          bankAccounts: bankAccounts,
          invoiceGenerateDays: data.invoiceGenerateDays ? parseInt(data.invoiceGenerateDays) : undefined,
          qrisStaticCode: data.qrisStaticCode ?? undefined,
          qrisMerchantName: data.qrisMerchantName ?? undefined,
          qrisEnabled: data.qrisEnabled ?? undefined,
          qrisDeviceKey: data.qrisDeviceKey ?? undefined,
          qrisDeviceSecret: data.qrisDeviceSecret ?? undefined,
        },
      });
    } else {
      // Create new
      company = await prisma.company.create({
        data: {
          id: crypto.randomUUID(),
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          baseUrl: data.baseUrl,
          adminPhone: data.adminPhone,
          logo: data.logo,
          timezone: data.timezone,
          poweredBy: data.poweredBy,
          customerIdPrefix: data.customerIdPrefix ?? null,
          footerAdmin: data.footerAdmin || 'Powered by SALFANET RADIUS',
          footerCustomer: data.footerCustomer || 'Powered by SALFANET RADIUS',
          footerTechnician: data.footerTechnician || 'Powered by SALFANET RADIUS',
          footerAgent: data.footerAgent || 'Powered by SALFANET RADIUS',
          bankAccounts: bankAccounts,
          invoiceGenerateDays: data.invoiceGenerateDays ? parseInt(data.invoiceGenerateDays) : 7,
          qrisStaticCode: data.qrisStaticCode ?? null,
          qrisMerchantName: data.qrisMerchantName ?? null,
          qrisEnabled: data.qrisEnabled ?? false,
          qrisDeviceKey: data.qrisDeviceKey ?? null,
          qrisDeviceSecret: data.qrisDeviceSecret ?? null,
        },
      });
    }
    
    // If timezone changed, update configuration files
    if (data.timezone && data.timezone !== existingCompany?.timezone) {
      // Update in-process timezone cache immediately
      setCurrentTimezone(data.timezone);
      
      try {
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const timezoneUpdateResponse = await fetch(`${baseUrl}/api/settings/timezone`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-call': 'true', // Mark as internal call
          },
          body: JSON.stringify({ timezone: data.timezone }),
        });
        
        const timezoneResult = await timezoneUpdateResponse.json();
        
        if (!timezoneUpdateResponse.ok) {
          console.error('Failed to update timezone files:', timezoneResult);
        }
      } catch (error) {
        console.error('Error calling timezone update API:', error);
      }
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error saving company:', error);
    return NextResponse.json(
      { error: 'Failed to save company settings' },
      { status: 500 }
    );
  }
}
