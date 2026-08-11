import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);
  else if (!normalized.startsWith('62')) normalized = '62' + normalized;
  return normalized;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== SEND ====================

  async sendMessage(phone: string, message: string) {
    const normalizedPhone = normalizePhone(phone);
    const providers = await this.prisma.whatsapp_providers.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (providers.length === 0) {
      throw new HttpException('No active WhatsApp provider', HttpStatus.BAD_REQUEST);
    }

    const attempts: any[] = [];
    for (const provider of providers) {
      try {
        const response = await fetch(provider.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({ phone: normalizedPhone, message }),
        });
        const result = await response.json();
        attempts.push({ provider: provider.name, success: response.ok, response: result });

        await this.prisma.whatsapp_history.create({
          data: {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            phone: normalizedPhone, message,
            status: response.ok ? 'sent' : 'failed',
            response: JSON.stringify(result),
            providerName: provider.name, providerType: provider.type,
          },
        });

        if (response.ok) {
          return { success: true, provider: provider.name, attempts, response: result };
        }
      } catch (err: any) {
        attempts.push({ provider: provider.name, success: false, error: err.message });
        this.logger.error(`Provider ${provider.name} failed: ${err.message}`);
      }
    }

    return { success: false, error: 'All providers failed', attempts };
  }

  // ==================== TEMPLATES ====================

  async listTemplates() {
    const count = await this.prisma.whatsapp_templates.count();
    if (count === 0) await this.seedDefaultTemplates();
    return this.prisma.whatsapp_templates.findMany({ orderBy: { type: 'asc' } });
  }

  async createTemplate(body: { name: string; type: string; message: string; isActive?: boolean }) {
    if (!body.name || !body.type || !body.message) {
      throw new HttpException('Name, type, and message are required', HttpStatus.BAD_REQUEST);
    }
    return this.prisma.whatsapp_templates.create({
      data: {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: body.name, type: body.type, message: body.message,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    });
  }

  async updateTemplate(id: string, body: { name?: string; type?: string; message?: string; isActive?: boolean }) {
    try {
      return await this.prisma.whatsapp_templates.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.message !== undefined && { message: body.message }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteTemplate(id: string) {
    try {
      await this.prisma.whatsapp_templates.delete({ where: { id } });
      return { success: true, message: 'Template deleted' };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== PROVIDERS ====================

  async listProviders() {
    return this.prisma.whatsapp_providers.findMany({ orderBy: { priority: 'desc' } });
  }

  async createProvider(body: { name: string; type: string; apiKey: string; apiUrl: string; senderNumber?: string; description?: string; isActive?: boolean; priority?: number }) {
    if (!body.name || !body.type || !body.apiKey || !body.apiUrl) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }
    return this.prisma.whatsapp_providers.create({
      data: {
        id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: body.name, type: body.type, apiKey: body.apiKey, apiUrl: body.apiUrl,
        senderNumber: body.senderNumber || null, description: body.description || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        priority: body.priority || 0,
      },
    });
  }

  async updateProvider(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.whatsapp_providers.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteProvider(id: string) {
    try {
      await this.prisma.whatsapp_providers.delete({ where: { id } });
      return { success: true, message: 'Provider deleted' };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async getProviderStatus(id: string) {
    const provider = await this.prisma.whatsapp_providers.findUnique({ where: { id } });
    if (!provider) throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);

    try {
      const response = await fetch(`${provider.apiUrl}/status`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      const result = await response.json() as any;
      return {
        status: result.status || 'unknown',
        connected: result.connected || result.status === 'connected',
        phone: result.phone || null,
        name: result.name || null,
      };
    } catch {
      return { status: 'error', connected: false, phone: null, name: null };
    }
  }

  async getProviderQr(id: string) {
    const provider = await this.prisma.whatsapp_providers.findUnique({ where: { id } });
    if (!provider) throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);

    try {
      const response = await fetch(`${provider.apiUrl}/qr`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      const result = await response.json() as any;
      return { qr: result.qr || result.data || null };
    } catch {
      throw new HttpException('Failed to fetch QR', HttpStatus.BAD_GATEWAY);
    }
  }

  async restartProvider(id: string) {
    const provider = await this.prisma.whatsapp_providers.findUnique({ where: { id } });
    if (!provider) throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);

    try {
      await fetch(`${provider.apiUrl}/restart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return { success: true, message: 'Provider restart initiated' };
    } catch {
      throw new HttpException('Failed to restart provider', HttpStatus.BAD_GATEWAY);
    }
  }

  async testProvider(id: string, phone: string) {
    const provider = await this.prisma.whatsapp_providers.findUnique({ where: { id } });
    if (!provider) throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);

    const normalizedPhone = normalizePhone(phone);
    try {
      const response = await fetch(provider.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({ phone: normalizedPhone, message: 'Test message from SalfaNet RADIUS' }),
      });
      const result = await response.json();

      await this.prisma.whatsapp_history.create({
        data: {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          phone: normalizedPhone, message: 'Test message',
          status: response.ok ? 'sent' : 'failed',
          response: JSON.stringify(result),
          providerName: provider.name, providerType: provider.type,
        },
      });

      return { success: response.ok, response: result, provider };
    } catch (err: any) {
      return { success: false, error: err.message, provider };
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
        { phone: { contains: params.search } },
        { message: { contains: params.search } },
        { providerName: { contains: params.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.whatsapp_history.findMany({
        where: where as never,
        orderBy: { sentAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.whatsapp_history.count({ where: where as never }),
    ]);

    const stats = {
      total: await this.prisma.whatsapp_history.count(),
      sent: await this.prisma.whatsapp_history.count({ where: { status: 'sent' } }),
      failed: await this.prisma.whatsapp_history.count({ where: { status: 'failed' } }),
      incoming: await this.prisma.whatsapp_history.count({ where: { status: 'incoming' } }),
    };

    return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, stats };
  }

  // ==================== REMINDER SETTINGS ====================

  async getReminderSettings() {
    let settings = await this.prisma.whatsapp_reminder_settings.findFirst();
    if (!settings) {
      settings = await this.prisma.whatsapp_reminder_settings.create({
        data: { enabled: false, reminderDays: [7, 3, 1], reminderTime: '09:00', otpEnabled: false, otpExpiry: 5 },
      } as never);
    }
    return { success: true, settings };
  }

  async updateReminderSettings(body: Record<string, unknown>) {
    const existing = await this.prisma.whatsapp_reminder_settings.findFirst();
    if (existing) {
      const updated = await this.prisma.whatsapp_reminder_settings.update({ where: { id: existing.id }, data: body as never });
      return { success: true, settings: updated };
    }
    const created = await this.prisma.whatsapp_reminder_settings.create({ data: body as never });
    return { success: true, settings: created };
  }

  // ==================== BROADCAST ====================

  async broadcast(body: { userIds: string[]; message: string; subject?: string; channel?: string; delay?: number }) {
    const { userIds, message, channel = 'whatsapp' } = body;
    if (!userIds?.length || !message) {
      throw new HttpException('userIds and message are required', HttpStatus.BAD_REQUEST);
    }

    const users = await this.prisma.pppoeUser.findMany({ where: { id: { in: userIds } } });
    const company = await this.prisma.company.findFirst();

    let successCount = 0;
    let failCount = 0;
    const results: any[] = [];

    for (const user of users) {
      if (!user.phone) { failCount++; results.push({ userId: user.id, success: false, error: 'No phone' }); continue; }
      let msg = message;
      const variables: Record<string, string> = {
        customerName: user.name || '', phone: user.phone, username: user.username,
        companyName: company?.name || 'ISP', companyPhone: company?.phone || '-',
      };
      for (const [k, v] of Object.entries(variables)) msg = msg.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);

      if (channel === 'whatsapp' || channel === 'both') {
        try {
          const result = await this.sendMessage(user.phone, msg);
          if (result.success) successCount++;
          else failCount++;
          results.push({ userId: user.id, success: result.success, channel: 'whatsapp' });
        } catch { failCount++; results.push({ userId: user.id, success: false, error: 'Send failed' }); }
      }
      // Email channel deferred to notification integration
    }

    return { success: true, total: users.length, successCount, failCount, results };
  }

  async broadcastInvoice(body: { invoiceIds: string[]; channel?: string }) {
    const { invoiceIds, channel = 'whatsapp' } = body;
    if (!invoiceIds?.length) throw new HttpException('invoiceIds are required', HttpStatus.BAD_REQUEST);

    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      include: { user: true },
    });

    const template = await this.prisma.whatsapp_templates.findFirst({
      where: { type: 'invoice-reminder', isActive: true },
    });

    let successCount = 0;
    let failCount = 0;
    const results: any[] = [];

    for (const inv of invoices) {
      if (!inv.user?.phone) { failCount++; results.push({ invoiceId: inv.id, success: false, error: 'No phone' }); continue; }
      let msg = template?.message || 'Tagihan #{{invoiceNumber}} - {{amount}}';
      const variables: Record<string, string> = {
        customerName: inv.user.name || '', invoiceNumber: inv.invoiceNumber || inv.id,
        amount: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount),
        dueDate: inv.dueDate?.toLocaleDateString('id-ID') || '-',
      };
      for (const [k, v] of Object.entries(variables)) msg = msg.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);

      if (channel === 'whatsapp' || channel === 'both') {
        try {
          const result = await this.sendMessage(inv.user.phone, msg);
          if (result.success) successCount++;
          else failCount++;
          results.push({ invoiceId: inv.id, success: result.success });
        } catch { failCount++; results.push({ invoiceId: inv.id, success: false, error: 'Send failed' }); }
      }
    }

    return { success: true, total: invoices.length, successCount, failCount, results };
  }

  // ==================== WEBHOOK ====================

  async handleWebhook(body: any, query: any) {
    // Normalize incoming message from various providers
    let phone = '', message = '';
    if (body.phone || body.phone_number) phone = body.phone || body.phone_number;
    if (body.message || body.text) message = body.message || body.text;
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      phone = msg.from || '';
      message = msg.text?.body || '';
    }

    if (phone && message) {
      await this.prisma.whatsapp_history.create({
        data: {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          phone, message, status: 'incoming',
          response: JSON.stringify(body),
          providerName: query.provider || null, providerType: query.type || null,
        },
      });
    }

    return { received: true };
  }

  // ==================== DEFAULT TEMPLATES ====================

  private async seedDefaultTemplates() {
    const defaults = [
      { name: 'Invoice Reminder', type: 'invoice-reminder', message: 'Halo {{customerName}},\n\nTagihan internet Anda #{{invoiceNumber}} sebesar {{amount}} akan jatuh tempo pada {{dueDate}}.\n\nMohon segera lakukan pembayaran. Terima kasih.' },
      { name: 'Payment Confirmation', type: 'payment-confirmation', message: 'Halo {{customerName}},\n\nPembayaran Anda sebesar {{amount}} telah kami terima. Terima kasih.' },
      { name: 'New User Welcome', type: 'new-user', message: 'Selamat datang {{customerName}}!\n\nAkun internet Anda telah aktif. Username: {{username}}\n\nTerima kasih telah memilih {{companyName}}.' },
      { name: 'Expiration Reminder', type: 'expiration-reminder', message: 'Halo {{customerName}},\n\nLayanan internet Anda akan berakhir dalam {{days}} hari. Mohon segera perpanjang.' },
      { name: 'Broadcast', type: 'broadcast', message: '{{message}}' },
      { name: 'Voucher Payment Link', type: 'voucher-payment-link', message: 'Halo {{customerName}},\n\nPembayaran voucher {{profileName}} sebesar {{totalAmount}}.\nLink: {{paymentLink}}\nBerlaku sampai {{expiryTime}}' },
      { name: 'OTP', type: 'otp', message: 'Kode OTP Anda: {{otpCode}}. Berlaku {{otpExpiry}} menit. Jangan bagikan kode ini.' },
      { name: 'Ticket Created', type: 'ticket-created', message: 'Tiket #{{ticketNumber}} telah dibuat. Subjek: {{subject}}' },
      { name: 'Ticket Update', type: 'ticket-update', message: 'Update tiket #{{ticketNumber}}: {{message}}' },
      { name: 'Suspend Notice', type: 'suspend-notice', message: 'Halo {{customerName}},\n\nLayanan Anda akan disuspend karena tagihan belum dibayar.' },
      { name: 'Reactivate Notice', type: 'reactivate-notice', message: 'Halo {{customerName}},\n\nLayanan Anda telah diaktifkan kembali. Terima kasih.' },
      { name: 'Registration Approved', type: 'registration-approved', message: 'Selamat {{customerName}}, registrasi Anda telah disetujui!' },
      { name: 'Registration Rejected', type: 'registration-rejected', message: 'Maaf {{customerName}}, registrasi Anda ditolak. Alasan: {{reason}}' },
      { name: 'Agent Deposit Success', type: 'agent-deposit-success', message: 'Deposit Anda sebesar {{amount}} berhasil. Saldo: {{balance}}' },
      { name: 'Agent Voucher Sold', type: 'agent-voucher-sold', message: 'Voucher {{voucherCode}} terjual. Komisi: {{commission}}' },
      { name: 'Maintenance Notice', type: 'maintenance', message: 'Pemberitahuan: Ada maintenance jadwal pada {{schedule}}. Layanan mungkin terganggu.' },
      { name: 'Custom Message', type: 'custom', message: '{{message}}' },
    ];

    for (const t of defaults) {
      await this.prisma.whatsapp_templates.create({
        data: {
          id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          ...t, isActive: true,
        },
      });
    }
  }
}
