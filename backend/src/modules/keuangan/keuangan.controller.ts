import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { KeuanganService } from './keuangan.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminJwtPayload } from '../auth/auth.service';

@ApiTags('keuangan')
@Controller('keuangan')
@UseGuards(AdminGuard)
export class KeuanganController {
  constructor(private readonly keuanganService: KeuanganService) {}

  // ==================== Transactions ====================

  @Get('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List transactions with filters, pagination, and stats' })
  @ApiQuery({ name: 'type', required: false, description: 'INCOME | EXPENSE | all' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD (WIB)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'YYYY-MM-DD (WIB)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTransactions(
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.keuanganService.getTransactions({
      type, categoryId, startDate, endDate, search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new transaction' })
  async createTransaction(@Body() body: Record<string, unknown>, @CurrentUser() user?: AdminJwtPayload) {
    return this.keuanganService.createTransaction(body as never, user as never);
  }

  @Put('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transaction' })
  async updateTransaction(@Body() body: Record<string, unknown>) {
    return this.keuanganService.updateTransaction(body as never);
  }

  @Delete('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete transaction(s) — single, bulk by IDs, or by filter' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated IDs' })
  @ApiQuery({ name: 'filterDelete', required: false, description: 'true to delete by filter' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  async deleteTransactions(
    @Query('id') id?: string,
    @Query('ids') ids?: string,
    @Query('filterDelete') filterDelete?: string,
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.keuanganService.deleteTransactions({
      id, ids, filterDelete: filterDelete === 'true',
      type, categoryId, startDate, endDate, search,
    });
  }

  // ==================== Categories ====================

  @Get('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List transaction categories' })
  @ApiQuery({ name: 'type', required: false, description: 'INCOME | EXPENSE | all' })
  async getCategories(@Query('type') type?: string) {
    return this.keuanganService.getCategories(type);
  }

  @Post('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create transaction category' })
  async createCategory(@Body() body: Record<string, unknown>) {
    return this.keuanganService.createCategory(body as never);
  }

  @Put('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transaction category' })
  async updateCategory(@Body() body: Record<string, unknown>) {
    return this.keuanganService.updateCategory(body as never);
  }

  @Delete('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete transaction category (blocks if transactions exist)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteCategory(@Query('id') id: string) {
    return this.keuanganService.deleteCategory(id);
  }
}
