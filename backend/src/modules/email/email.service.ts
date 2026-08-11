import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== SETTINGS ====================

  async getSettings() {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings) return null;
    return { ...settings, smtpPassword: settings.smtpPassword ? '***' : null };
  }

  async updateSettings(body: Record<string, unknown>) {
    const existing = await this.prisma.emailSettings.findFirst();
    if (existing) {
      const data = { ...body };
      if (data.smtpPassword === '***') delete data.smtpPassword;
      return this.prisma.emailSettings.update({ where: { id: existing.id }, data: data as never });
    }
    return this.prisma.emailSettings.create({ data: body as never });
  }

  async testEmail(body: { toEmail: string }) {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings || !settings.enabled) throw new HttpException('Email not configured or disabled', HttpStatus.BAD_REQUEST);

    // Nodemailer integration deferred
    this.logger.log(`Test email to ${body.toEmail} deferred (nodemailer integration pending)`);
    return { success: true, message: 'Test email sending deferred to nodemailer integration.', to: body.toEmail };
  }

  // ==================== TEMPLATES ====================

  async listTemplates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    return template;
  }

  async createTemplate(body: { name: string; type: string; subject: string; htmlBody: string; isActive?: boolean }) {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { type: body.type } });
    if (existing) throw new HttpException('Template with this type already exists', HttpStatus.BAD_REQUEST);
    return this.prisma.emailTemplate.create({ data: body });
  }

  async updateTemplate(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.emailTemplate.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteTemplate(id: string) {
    try {
      await this.prisma.emailTemplate.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== HISTORY ====================

  async listHistory(params: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { toEmail: { contains: params.search } },
        { subject: { contains: params.search } },
      ];
    }

    const [history, total] = await Promise.all([
      this.prisma.emailHistory.findMany({
        where: where as never,
        orderBy: { sentAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.emailHistory.count({ where: where as never }),
    ]);

    return { history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ==================== SEND (helper, not exposed) ====================

  async sendEmail(to: string, subject: string, htmlBody: string, toName?: string) {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings || !settings.enabled) {
      this.logger.warn('Email not configured, skipping send');
      return { success: false, reason: 'not_configured' };
    }

    // Nodemailer integration deferred — log to history as 'failed'
    try {
      await this.prisma.emailHistory.create({
        data: { toEmail: to, toName: toName || null, subject, body: htmlBody, status: 'failed', error: 'Nodemailer integration pending' },
      });
      return { success: false, reason: 'nodemailer_not_integrated' };
    } catch (err: any) {
      this.logger.error(`Failed to log email: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
