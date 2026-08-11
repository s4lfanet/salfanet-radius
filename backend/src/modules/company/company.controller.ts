import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('company')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /**
   * Get company settings (authenticated)
   */
  @Get()
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get company settings (authenticated)' })
  async getCompany() {
    return this.companyService.getCompany();
  }

  /**
   * Get public company info (no auth)
   */
  @Public()
  @Get('info')
  @ApiOperation({ summary: 'Get public company info (no auth required)' })
  async getCompanyInfo() {
    const company = await this.companyService.getCompanyInfo();
    if (!company) {
      throw new HttpException(
        { success: false, error: 'Company not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true, data: company };
  }

  /**
   * Create or update company settings
   */
  @Post()
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create or update company settings' })
  async saveCompany(@Body() body: unknown) {
    return this.companyService.saveCompany(body as Record<string, unknown> as never);
  }
}
