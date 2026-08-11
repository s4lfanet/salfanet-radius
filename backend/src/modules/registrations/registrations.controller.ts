import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('registrations')
@Controller('registrations')
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit new registration request (public)' })
  async create(@Body() body: Record<string, unknown>) {
    return this.registrationsService.createRegistration(body as never);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registration requests (admin)' })
  async list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const take = limit ? parseInt(limit) : 20;
    const skip = page ? (parseInt(page) - 1) * take : 0;

    const [data, total] = await Promise.all([
      this.prisma.registrationRequest.findMany({
        where: where as never,
        include: { profile: { select: { name: true } }, area: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take, skip,
      }),
      this.prisma.registrationRequest.count({ where: where as never }),
    ]);

    return {
      success: true,
      data,
      pagination: { page: page ? parseInt(page) : 1, limit: take, total, totalPages: Math.ceil(total / take) },
    };
  }
}
