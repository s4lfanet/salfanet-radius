import { Body, Controller, Delete, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { InventoryService } from './inventory.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==================== ITEMS ====================

  @Get('items')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List inventory items with filters' })
  async listItems(
    @Query('categoryId') categoryId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('search') search?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.inventoryService.listItems({
      categoryId, supplierId, search,
      lowStock: lowStock === 'true',
    });
  }

  @Post('items')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create inventory item' })
  async createItem(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const userId = (req as any).user?.sub || 'system';
    const userName = (req as any).user?.name || (req as any).user?.username || 'System';
    return this.inventoryService.createItem(body as never, userId, userName);
  }

  @Put('items')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update inventory item' })
  async updateItem(@Body() body: Record<string, unknown>) {
    return this.inventoryService.updateItem(body as never);
  }

  @Delete('items')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete inventory item' })
  async deleteItem(@Query('id') id: string) {
    return this.inventoryService.deleteItem(id);
  }

  // ==================== CATEGORIES ====================

  @Get('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List inventory categories' })
  async listCategories() {
    return this.inventoryService.listCategories();
  }

  @Post('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create inventory category' })
  async createCategory(@Body() body: { name: string; description?: string }) {
    return this.inventoryService.createCategory(body);
  }

  @Put('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update inventory category' })
  async updateCategory(@Body() body: { id: string; name?: string; description?: string }) {
    return this.inventoryService.updateCategory(body);
  }

  @Delete('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete inventory category' })
  async deleteCategory(@Query('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }

  // ==================== SUPPLIERS ====================

  @Get('suppliers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List inventory suppliers' })
  async listSuppliers() {
    return this.inventoryService.listSuppliers();
  }

  @Post('suppliers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create inventory supplier' })
  async createSupplier(@Body() body: Record<string, unknown>) {
    return this.inventoryService.createSupplier(body as never);
  }

  @Put('suppliers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update inventory supplier' })
  async updateSupplier(@Body() body: Record<string, unknown>) {
    return this.inventoryService.updateSupplier(body as never);
  }

  @Delete('suppliers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete inventory supplier' })
  async deleteSupplier(@Query('id') id: string) {
    return this.inventoryService.deleteSupplier(id);
  }

  // ==================== MOVEMENTS ====================

  @Get('movements')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List stock movements' })
  async listMovements(
    @Query('itemId') itemId?: string,
    @Query('movementType') movementType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listMovements({
      itemId, movementType,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('movements')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create stock movement (IN/OUT/ADJUSTMENT)' })
  async createMovement(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const userId = (req as any).user?.sub || 'system';
    const userName = (req as any).user?.name || (req as any).user?.username || 'System';
    return this.inventoryService.createMovement(body as never, userId, userName);
  }

  @Delete('movements')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete (reverse) stock movement' })
  async deleteMovement(@Query('id') id: string) {
    return this.inventoryService.deleteMovement(id);
  }
}
