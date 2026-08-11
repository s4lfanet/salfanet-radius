import { Body, Controller, Post, HttpCode, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { RadiusService } from './radius.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('radius')
@Controller('radius')
@Public() // RADIUS hooks are called by FreeRADIUS, not by authenticated users
export class RadiusController {
  constructor(private readonly radiusService: RadiusService) {}

  @Post('authorize')
  @HttpCode(200)
  @ApiOperation({ summary: 'RADIUS authorize hook (called by FreeRADIUS before auth)' })
  async authorize(@Body() body: { username?: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.radiusService.authorize(body.username || '');
    res.status(result.status);
    return result.body ?? {};
  }

  @Post('post-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'RADIUS post-auth hook (called after successful auth)' })
  async postAuth(@Body() body: { username?: string; reply?: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.radiusService.postAuth(body.username || '', body.reply || '');
    res.status(result.status);
    return result.body ?? {};
  }

  @Post('accounting')
  @HttpCode(200)
  @ApiOperation({ summary: 'RADIUS accounting hook (logging only, radacct handled by SQL module)' })
  async accounting(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const result = await this.radiusService.accounting(body as never);
    res.status(result.status);
    return {};
  }

  @Post('coa')
  @HttpCode(200)
  @ApiOperation({ summary: 'RADIUS CoA (Change of Authorization) - execution deferred' })
  async coa(@Body() body: { action: string; username?: string; attributes?: Record<string, unknown>; host?: string }) {
    return this.radiusService.coa(body);
  }
}
