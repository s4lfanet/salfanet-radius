/**
 * Fiber Core Management Prisma Models Accessor
 * 
 * This module provides safe access to fiber core management Prisma models.
 * These models will only be available after the fiber core management migration is applied.
 * 
 * Migration file: prisma/migrations/20260122000000_add_fiber_core_management/migration.sql
 */

import { prisma } from '@/server/db/client';

// Type definitions for fiber management models
export interface FiberCableRecord {
  id: string;
  code: string;
  name: string;
  cableType: string;
  tubeCount: number;
  coresPerTube: number;
  totalCores: number;
  outerDiameter?: number;
  manufacturer?: string;
  partNumber?: string;
  status: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  tubes?: FiberTubeRecord[];
}

export interface FiberTubeRecord {
  id: string;
  cableId: string;
  tubeNumber: number;
  colorCode: string;
  colorHex: string;
  status: string;
  notes?: string;
  cores?: FiberCoreRecord[];
}

export interface FiberCoreRecord {
  id: string;
  tubeId: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: string;
  assignedToType?: string;
  assignedToId?: string;
  attenuation?: number;
  notes?: string;
}

export interface SplicePointRecord {
  id: string;
  deviceType: string;
  deviceId: string;
  trayNumber: number;
  incomingCoreId: string;
  outgoingCoreId?: string;
  spliceType: string;
  insertionLoss?: number;
  reflectance?: number;
  spliceDate?: Date;
  splicedBy?: string;
  status: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CableSegmentRecord {
  id: string;
  cableId: string;
  segmentNumber: number;
  startDeviceType?: string;
  startDeviceId?: string;
  endDeviceType?: string;
  endDeviceId?: string;
  lengthMeters?: number;
  attenuation?: number;
  installationDate?: Date;
  status: string;
  notes?: string;
}

export interface CoreAssignmentHistoryRecord {
  id: string;
  coreId: string;
  action: string;
  assignedToType?: string;
  assignedToId?: string;
  previousStatus: string;
  newStatus: string;
  performedBy?: string;
  reason?: string;
  createdAt: Date;
}

// Error class for migration not applied scenarios
export class MigrationNotAppliedError extends Error {
  constructor(modelName: string) {
    super(`Fiber core management model '${modelName}' is not available. Please run the migration first.`);
    this.name = 'MigrationNotAppliedError';
  }
}

// Generic model accessor type
type PrismaModel = {
  findMany: (args?: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  findFirst: (args?: any) => Promise<any | null>;
  create: (args: any) => Promise<any>;
  createMany: (args: any) => Promise<{ count: number }>;
  update: (args: any) => Promise<any>;
  updateMany: (args: any) => Promise<{ count: number }>;
  delete: (args: any) => Promise<any>;
  deleteMany: (args?: any) => Promise<{ count: number }>;
  count: (args?: any) => Promise<number>;
  aggregate: (args: any) => Promise<any>;
  groupBy?: (args: any) => Promise<any[]>;
};

// Cache for model availability check
let _modelsAvailable: boolean | null = null;

/**
 * Check if fiber core management models are available
 */
export async function checkFiberModelsAvailable(): Promise<boolean> {
  if (_modelsAvailable !== null) {
    return _modelsAvailable;
  }
  
  try {
    // Try to query the fiber_cables table
    const model = (prisma as any).fiber_cables;
    if (!model) {
      _modelsAvailable = false;
      return false;
    }
    
    // Try a simple count query
    await model.count();
    _modelsAvailable = true;
    return true;
  } catch (error: any) {
    // If table doesn't exist, migration not applied
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      _modelsAvailable = false;
      return false;
    }
    // Other errors - assume models are available but there's a different issue
    _modelsAvailable = true;
    return true;
  }
}

/**
 * Reset the cached model availability check
 * Useful after running migrations
 */
export function resetModelAvailabilityCache(): void {
  _modelsAvailable = null;
}

/**
 * Get fiber_cables Prisma model
 */
export async function getFiberCablesModel(): Promise<PrismaModel> {
  const model = (prisma as any).fiber_cables;
  if (!model) {
    throw new MigrationNotAppliedError('fiber_cables');
  }
  return model;
}

/**
 * Get fiber_tubes Prisma model
 */
export async function getFiberTubesModel(): Promise<PrismaModel> {
  const model = (prisma as any).fiber_tubes;
  if (!model) {
    throw new MigrationNotAppliedError('fiber_tubes');
  }
  return model;
}

/**
 * Get fiber_cores Prisma model
 */
export async function getFiberCoresModel(): Promise<PrismaModel> {
  const model = (prisma as any).fiber_cores;
  if (!model) {
    throw new MigrationNotAppliedError('fiber_cores');
  }
  return model;
}

/**
 * Get splice_points Prisma model
 */
export async function getSplicePointsModel(): Promise<PrismaModel> {
  const model = (prisma as any).splice_points;
  if (!model) {
    throw new MigrationNotAppliedError('splice_points');
  }
  return model;
}

/**
 * Get cable_segments Prisma model
 */
export async function getCableSegmentsModel(): Promise<PrismaModel> {
  const model = (prisma as any).cable_segments;
  if (!model) {
    throw new MigrationNotAppliedError('cable_segments');
  }
  return model;
}

/**
 * Get core_assignment_history Prisma model
 */
export async function getCoreAssignmentHistoryModel(): Promise<PrismaModel> {
  const model = (prisma as any).core_assignment_history;
  if (!model) {
    throw new MigrationNotAppliedError('core_assignment_history');
  }
  return model;
}

/**
 * Safe wrapper for API routes that require fiber core management
 * Returns appropriate error response if migration not applied
 */
export async function withFiberModels<T>(
  handler: () => Promise<T>,
  errorResponse: any = { 
    error: 'Fiber core management not available. Please run the migration first.',
    code: 'MIGRATION_REQUIRED'
  }
): Promise<T | typeof errorResponse> {
  try {
      // Quick check if models exist in prisma client
    if (!(prisma as any).fiber_cables) {
      return Promise.resolve(errorResponse);
    }
    return handler();
  } catch (error) {
    if (error instanceof MigrationNotAppliedError) {
      return Promise.resolve(errorResponse);
    }
    throw error;
  }
}

// Convenience export of Prisma with fiber models (typed as any for flexibility)
export const fiberPrisma = {
  fiber_cables: () => getFiberCablesModel(),
  fiber_tubes: () => getFiberTubesModel(),
  fiber_cores: () => getFiberCoresModel(),
  splice_points: () => getSplicePointsModel(),
  cable_segments: () => getCableSegmentsModel(),
  core_assignment_history: () => getCoreAssignmentHistoryModel(),
} as const;

export default fiberPrisma;

