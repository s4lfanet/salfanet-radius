import { NextResponse } from 'next/server';
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
        },
      });
    }
    
    // If timezone changed, update configuration files
    if (data.timezone && data.timezone !== existingCompany?.timezone) {
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
