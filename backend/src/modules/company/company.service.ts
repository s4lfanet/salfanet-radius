import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CompanyData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  baseUrl?: string;
  adminPhone?: string;
  logo?: string | null;
  timezone?: string;
  poweredBy?: string;
  customerIdPrefix?: string | null;
  footerAdmin?: string;
  footerCustomer?: string;
  footerTechnician?: string;
  footerAgent?: string;
  bankAccounts?: unknown;
  invoiceGenerateDays?: number | string;
}

const DEFAULT_COMPANY = {
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
};

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get company settings (authenticated)
   */
  async getCompany() {
    const company = await this.prisma.company.findFirst();
    if (!company) {
      return DEFAULT_COMPANY;
    }
    return company;
  }

  /**
   * Get public company info (no auth required)
   */
  async getCompanyInfo() {
    const company = await this.prisma.company.findFirst({
      select: {
        name: true,
        phone: true,
        email: true,
        address: true,
        logo: true,
        isolationMessage: true,
        bankAccounts: true,
      },
    });

    if (!company) {
      return null;
    }

    return company;
  }

  /**
   * Create or update company settings
   */
  async saveCompany(data: CompanyData) {
    const existingCompany = await this.prisma.company.findFirst();

    // Parse bank accounts if provided as string
    let bankAccounts = data.bankAccounts;
    if (bankAccounts && typeof bankAccounts === 'string') {
      try {
        bankAccounts = JSON.parse(bankAccounts as string);
      } catch {
        bankAccounts = [];
      }
    }

    let company;
    if (existingCompany) {
      company = await this.prisma.company.update({
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
          bankAccounts: bankAccounts as never,
          invoiceGenerateDays: data.invoiceGenerateDays
            ? parseInt(String(data.invoiceGenerateDays))
            : undefined,
        },
      });
    } else {
      company = await this.prisma.company.create({
        data: {
          id: crypto.randomUUID(),
          name: data.name || DEFAULT_COMPANY.name,
          email: data.email || DEFAULT_COMPANY.email,
          phone: data.phone || DEFAULT_COMPANY.phone,
          address: data.address || DEFAULT_COMPANY.address,
          baseUrl: data.baseUrl || DEFAULT_COMPANY.baseUrl,
          adminPhone: data.adminPhone || DEFAULT_COMPANY.adminPhone,
          logo: data.logo || null,
          timezone: data.timezone || DEFAULT_COMPANY.timezone,
          poweredBy: data.poweredBy || DEFAULT_COMPANY.poweredBy,
          customerIdPrefix: data.customerIdPrefix ?? null,
          footerAdmin: data.footerAdmin || DEFAULT_COMPANY.footerAdmin,
          footerCustomer: data.footerCustomer || DEFAULT_COMPANY.footerCustomer,
          footerTechnician: data.footerTechnician || DEFAULT_COMPANY.footerTechnician,
          footerAgent: data.footerAgent || DEFAULT_COMPANY.footerAgent,
          bankAccounts: bankAccounts as never,
          invoiceGenerateDays: data.invoiceGenerateDays
            ? parseInt(String(data.invoiceGenerateDays))
            : 7,
        },
      });
    }

    return company;
  }
}
