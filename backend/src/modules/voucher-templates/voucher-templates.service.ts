import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VoucherTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates() {
    return this.prisma.voucherTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.voucherTemplate.findUnique({ where: { id } });
    if (!template) throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    return template;
  }

  async createTemplate(body: { name: string; htmlTemplate: string; isDefault?: boolean; isActive?: boolean }) {
    const { name, htmlTemplate, isDefault, isActive } = body;
    if (!name || !htmlTemplate) {
      throw new HttpException('Name and htmlTemplate are required', HttpStatus.BAD_REQUEST);
    }
    if (isDefault) {
      await this.prisma.voucherTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return this.prisma.voucherTemplate.create({
      data: {
        id: crypto.randomUUID(),
        name, htmlTemplate,
        isDefault: isDefault || false,
        isActive: isActive !== undefined ? isActive : true,
      },
    });
  }

  async updateTemplate(id: string, body: { name?: string; htmlTemplate?: string; isDefault?: boolean; isActive?: boolean }) {
    if (body.isDefault) {
      await this.prisma.voucherTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    try {
      return await this.prisma.voucherTemplate.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.htmlTemplate && { htmlTemplate: body.htmlTemplate }),
          ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
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
      await this.prisma.voucherTemplate.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }
}
