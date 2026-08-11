import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== ITEMS ====================

  async listItems(params: { categoryId?: string; supplierId?: string; search?: string; lowStock?: boolean }) {
    const where: Record<string, unknown> = {};
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { sku: { contains: params.search } },
        { description: { contains: params.search } },
      ];
    }
    if (params.lowStock) {
      where.AND = [{ currentStock: { lte: this.prisma.inventoryItem.fields.minimumStock } }];
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: where as never,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => ({
      ...item,
      stockStatus: item.currentStock === 0 ? 'out_of_stock' : item.currentStock <= item.minimumStock ? 'low_stock' : 'in_stock',
    }));
  }

  async createItem(body: {
    sku: string; name: string; description?: string; categoryId?: string; supplierId?: string;
    unit?: string; minimumStock?: number; currentStock?: number;
    purchasePrice?: number; sellingPrice?: number; location?: string; notes?: string; isActive?: boolean;
  }, userId: string, userName: string) {
    if (!body.sku || !body.name) throw new HttpException('SKU and name are required', HttpStatus.BAD_REQUEST);

    try {
      const item = await this.prisma.inventoryItem.create({
        data: {
          sku: body.sku, name: body.name, description: body.description,
          categoryId: body.categoryId || null, supplierId: body.supplierId || null,
          unit: body.unit || 'pcs', minimumStock: body.minimumStock || 0,
          currentStock: body.currentStock || 0,
          purchasePrice: body.purchasePrice || 0, sellingPrice: body.sellingPrice || 0,
          location: body.location, notes: body.notes,
          isActive: body.isActive !== undefined ? body.isActive : true,
        },
        include: { category: true, supplier: true },
      });

      if (body.currentStock && body.currentStock > 0) {
        await this.prisma.inventoryMovement.create({
          data: {
            itemId: item.id, movementType: 'IN', quantity: body.currentStock,
            previousStock: 0, newStock: body.currentStock,
            notes: 'Initial stock', userId, userName,
          },
        });
      }

      return item;
    } catch (error: any) {
      if (error.code === 'P2002') throw new HttpException('SKU already exists', HttpStatus.BAD_REQUEST);
      throw error;
    }
  }

  async updateItem(body: {
    id: string; sku?: string; name?: string; description?: string; categoryId?: string; supplierId?: string;
    unit?: string; minimumStock?: number; purchasePrice?: number; sellingPrice?: number;
    location?: string; notes?: string; isActive?: boolean;
  }) {
    try {
      return await this.prisma.inventoryItem.update({
        where: { id: body.id },
        data: {
          ...(body.sku !== undefined && { sku: body.sku }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.categoryId !== undefined && { categoryId: body.categoryId || null }),
          ...(body.supplierId !== undefined && { supplierId: body.supplierId || null }),
          ...(body.unit !== undefined && { unit: body.unit }),
          ...(body.minimumStock !== undefined && { minimumStock: body.minimumStock }),
          ...(body.purchasePrice !== undefined && { purchasePrice: body.purchasePrice }),
          ...(body.sellingPrice !== undefined && { sellingPrice: body.sellingPrice }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
        include: { category: true, supplier: true },
      });
    } catch (error: any) {
      if (error.code === 'P2002') throw new HttpException('SKU already exists', HttpStatus.BAD_REQUEST);
      if (error.code === 'P2025') throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteItem(id: string) {
    try {
      await this.prisma.inventoryItem.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== CATEGORIES ====================

  async listCategories() {
    return this.prisma.inventoryCategory.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(body: { name: string; description?: string }) {
    if (!body.name) throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    return this.prisma.inventoryCategory.create({ data: { name: body.name, description: body.description } });
  }

  async updateCategory(body: { id: string; name?: string; description?: string }) {
    try {
      return await this.prisma.inventoryCategory.update({
        where: { id: body.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteCategory(id: string) {
    const itemCount = await this.prisma.inventoryItem.count({ where: { categoryId: id } });
    if (itemCount > 0) throw new HttpException('Cannot delete category with assigned items', HttpStatus.BAD_REQUEST);
    await this.prisma.inventoryCategory.delete({ where: { id } });
    return { success: true };
  }

  // ==================== SUPPLIERS ====================

  async listSuppliers() {
    return this.prisma.inventorySupplier.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(body: { name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean }) {
    if (!body.name) throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    return this.prisma.inventorySupplier.create({
      data: {
        name: body.name, contactName: body.contactName, phone: body.phone,
        email: body.email, address: body.address, notes: body.notes,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    });
  }

  async updateSupplier(body: { id: string; name?: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean }) {
    try {
      return await this.prisma.inventorySupplier.update({
        where: { id: body.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.contactName !== undefined && { contactName: body.contactName }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.email !== undefined && { email: body.email }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Supplier not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteSupplier(id: string) {
    const itemCount = await this.prisma.inventoryItem.count({ where: { supplierId: id } });
    if (itemCount > 0) throw new HttpException('Cannot delete supplier with assigned items', HttpStatus.BAD_REQUEST);
    await this.prisma.inventorySupplier.delete({ where: { id } });
    return { success: true };
  }

  // ==================== MOVEMENTS ====================

  async listMovements(params: { itemId?: string; movementType?: string; limit?: number }) {
    const where: Record<string, unknown> = {};
    if (params.itemId) where.itemId = params.itemId;
    if (params.movementType) where.movementType = params.movementType;

    return this.prisma.inventoryMovement.findMany({
      where: where as never,
      include: { item: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit || 100,
    });
  }

  async createMovement(body: { itemId: string; movementType: string; quantity: number; referenceNo?: string; notes?: string }, userId: string, userName: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: body.itemId } });
    if (!item) throw new HttpException('Item not found', HttpStatus.NOT_FOUND);

    const previousStock = item.currentStock;
    let newStock = previousStock;

    switch (body.movementType) {
      case 'IN': newStock = previousStock + body.quantity; break;
      case 'OUT':
        if (body.quantity > previousStock) throw new HttpException('Insufficient stock', HttpStatus.BAD_REQUEST);
        newStock = previousStock - body.quantity;
        break;
      case 'ADJUSTMENT': newStock = body.quantity; break;
      default: throw new HttpException('Invalid movement type', HttpStatus.BAD_REQUEST);
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          itemId: body.itemId, movementType: body.movementType, quantity: body.quantity,
          previousStock, newStock, referenceNo: body.referenceNo || null,
          notes: body.notes || null, userId, userName,
        },
      });
      await tx.inventoryItem.update({ where: { id: body.itemId }, data: { currentStock: newStock } });
      return movement;
    });
  }

  async deleteMovement(id: string) {
    const movement = await this.prisma.inventoryMovement.findUnique({ where: { id } });
    if (!movement) throw new HttpException('Movement not found', HttpStatus.NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: movement.itemId } });
      if (item) {
        let restoredStock = item.currentStock;
        if (movement.movementType === 'IN') restoredStock -= movement.quantity;
        else if (movement.movementType === 'OUT') restoredStock += movement.quantity;
        else restoredStock = movement.previousStock;
        await tx.inventoryItem.update({ where: { id: movement.itemId }, data: { currentStock: restoredStock } });
      }
      await tx.inventoryMovement.delete({ where: { id } });
      return { success: true };
    });
  }
}
