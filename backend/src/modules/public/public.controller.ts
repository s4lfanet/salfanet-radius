import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('company')
  @ApiOperation({ summary: 'Get company info (public)' })
  async getCompanyInfo() {
    return this.publicService.getCompanyInfo();
  }

  @Public()
  @Get('areas')
  @ApiOperation({ summary: 'Get active areas (public)' })
  async getAreas() {
    return this.publicService.getAreas();
  }

  @Public()
  @Get('profiles')
  @ApiOperation({ summary: 'Get active internet packages (public)' })
  async getProfiles() {
    return this.publicService.getProfiles();
  }

  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Get public stats (rounded, no revenue)' })
  async getStats() {
    return this.publicService.getStats();
  }

  @Public()
  @Get('payment-gateways')
  @ApiOperation({ summary: 'Get active payment gateways (public)' })
  async getPaymentGateways() {
    return this.publicService.getPaymentGateways();
  }
}
