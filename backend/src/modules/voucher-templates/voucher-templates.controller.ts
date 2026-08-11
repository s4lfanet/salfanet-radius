import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VoucherTemplatesService } from './voucher-templates.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('voucher-templates')
@Controller('voucher-templates')
export class VoucherTemplatesController {
  constructor(private readonly voucherTemplatesService: VoucherTemplatesService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all voucher templates' })
  async list() {
    return this.voucherTemplatesService.listTemplates();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new voucher template' })
  async create(@Body() body: { name: string; htmlTemplate: string; isDefault?: boolean; isActive?: boolean }) {
    return this.voucherTemplatesService.createTemplate(body);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single voucher template' })
  async getOne(@Param('id') id: string) {
    return this.voucherTemplatesService.getTemplate(id);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update voucher template' })
  async update(@Param('id') id: string, @Body() body: { name?: string; htmlTemplate?: string; isDefault?: boolean; isActive?: boolean }) {
    return this.voucherTemplatesService.updateTemplate(id, body);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete voucher template' })
  async delete(@Param('id') id: string) {
    return this.voucherTemplatesService.deleteTemplate(id);
  }
}
