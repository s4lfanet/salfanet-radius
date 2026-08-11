import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async buildTransporter(): Promise<nodemailer.Transporter> {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings || !settings.enabled) throw new HttpException('Email not configured or disabled', HttpStatus.BAD_REQUEST);
    if (!settings.smtpHost || !settings.smtpPort) throw new HttpException('SMTP host/port not configured', HttpStatus.BAD_REQUEST);

    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure || settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPassword },
    });
  }

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

    try {
      const transporter = await this.buildTransporter();
      const info = await transporter.sendMail({
        from: settings.fromEmail || settings.smtpUser || 'no-reply@salfanet.id',
        to: body.toEmail,
        subject: 'Salfanet Test Email',
        html: '<h1>Salfanet Test Email</h1><p>This is a test email from Salfanet Radius.</p>',
      });
      this.logger.log(`Test email sent to ${body.toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId, to: body.toEmail };
    } catch (err: any) {
      this.logger.error(`Test email failed: ${err.message}`);
      throw new HttpException({ error: 'Failed to send test email', details: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
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

    try {
      const transporter = await this.buildTransporter();
      const info = await transporter.sendMail({
        from: settings.fromEmail || settings.smtpUser || 'no-reply@salfanet.id',
        to: toName ? `${toName} <${to}>` : to,
        subject,
        html: htmlBody,
      });
      await this.prisma.emailHistory.create({
        data: { toEmail: to, toName: toName || null, subject, body: htmlBody, status: 'sent', sentAt: new Date() },
      });
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      try {
        await this.prisma.emailHistory.create({
          data: { toEmail: to, toName: toName || null, subject, body: htmlBody, status: 'failed', error: err.message },
        });
      } catch (logErr) {
        this.logger.error(`Failed to log email error: ${logErr}`);
      }
      return { success: false, error: err.message };
    }
  }
}
