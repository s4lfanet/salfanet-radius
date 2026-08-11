// Fiber Core Management Types and Constants
// Based on VETRO FiberMap-inspired Network Topology Diagram System

// =====================================================
// FIBER COLOR CODING (TIA-598-D Standard)
// =====================================================

export const FIBER_COLORS = [
  { number: 1, name: 'Blue', nameId: 'Biru', hex: '#0047AB' },
  { number: 2, name: 'Orange', nameId: 'Oranye', hex: '#FF7F00' },
  { number: 3, name: 'Green', nameId: 'Hijau', hex: '#228B22' },
  { number: 4, name: 'Brown', nameId: 'Coklat', hex: '#8B4513' },
  { number: 5, name: 'Slate', nameId: 'Abu-abu', hex: '#708090' },
  { number: 6, name: 'White', nameId: 'Putih', hex: '#FFFFFF' },
  { number: 7, name: 'Red', nameId: 'Merah', hex: '#FF0000' },
  { number: 8, name: 'Black', nameId: 'Hitam', hex: '#000000' },
  { number: 9, name: 'Yellow', nameId: 'Kuning', hex: '#FFFF00' },
  { number: 10, name: 'Violet', nameId: 'Ungu', hex: '#8B008B' },
  { number: 11, name: 'Rose', nameId: 'Mawar', hex: '#FF69B4' },
  { number: 12, name: 'Aqua', nameId: 'Biru Muda', hex: '#00FFFF' },
] as const;

export function getFiberColor(number: number): typeof FIBER_COLORS[number] {
  return FIBER_COLORS[(number - 1) % 12];
}

export function getFullCoreIdentifier(tubeNumber: number, coreNumber: number): string {
  const tube = getFiberColor(tubeNumber);
  const core = getFiberColor(coreNumber);
  return `T${tubeNumber}-C${coreNumber} (${tube.name}/${core.name})`;
}

// =====================================================
// CABLE TYPE DEFINITIONS
// =====================================================

export type CableType = 'SM_G652' | 'SM_G657A1' | 'SM_G657A2' | 'MM_OM3' | 'MM_OM4';

export const CABLE_TYPES: Record<CableType, { name: string; description: string; attenuationPerKm: number }> = {
  SM_G652: { 
    name: 'Single-mode G.652', 
    description: 'Standard single-mode fiber for metro/access networks',
    attenuationPerKm: 0.35
  },
  SM_G657A1: { 
    name: 'Single-mode G.657.A1', 
    description: 'Bend-insensitive fiber for FTTH, 10mm bend radius',
    attenuationPerKm: 0.35
  },
  SM_G657A2: { 
    name: 'Single-mode G.657.A2', 
    description: 'Enhanced bend-insensitive fiber, 7.5mm bend radius',
    attenuationPerKm: 0.35
  },
  MM_OM3: { 
    name: 'Multi-mode OM3', 
    description: '10 Gigabit Ethernet optimized multimode fiber',
    attenuationPerKm: 3.5
  },
  MM_OM4: { 
    name: 'Multi-mode OM4', 
    description: '40/100 Gigabit Ethernet optimized multimode fiber',
    attenuationPerKm: 3.0
  },
};

// Standard tube configurations
export const STANDARD_TUBE_CONFIGS = [
  { tubes: 2, coresPerTube: 6, total: 12 },
  { tubes: 4, coresPerTube: 6, total: 24 },
  { tubes: 4, coresPerTube: 12, total: 48 },
  { tubes: 6, coresPerTube: 12, total: 72 },
  { tubes: 8, coresPerTube: 12, total: 96 },
  { tubes: 12, coresPerTube: 12, total: 144 },
  { tubes: 24, coresPerTube: 12, total: 288 },
] as const;

// =====================================================
// SPLITTER CONFIGURATIONS
// =====================================================

// PLC Splitter (Even Split) - Insertion Loss Values
export const PLC_SPLITTER_LOSS: Record<string, number> = {
  '1:2': 3.5,
  '1:4': 7.0,
  '1:8': 10.5,
  '1:16': 14.0,
  '1:32': 17.5,
  '1:64': 21.0,
  '1:128': 24.5,
};

// FBT Splitter - Uneven Ratio (for Estafet/Daisy-Chain)
export const FBT_UNEVEN_LOSS: Record<string, { tap: number; through: number }> = {
  '5:95': { tap: 13.0, through: 0.2 },
  '10:90': { tap: 10.0, through: 0.5 },
  '15:85': { tap: 8.2, through: 0.7 },
  '20:80': { tap: 7.0, through: 1.0 },
  '25:75': { tap: 6.0, through: 1.2 },
  '30:70': { tap: 5.2, through: 1.5 },
  '35:65': { tap: 4.6, through: 1.9 },
  '40:60': { tap: 4.0, through: 2.2 },
  '45:55': { tap: 3.5, through: 2.6 },
  '50:50': { tap: 3.0, through: 3.0 },
};

export const SPLITTER_RATIOS = ['1:2', '1:4', '1:8', '1:16', '1:32', '1:64', '1:128'] as const;
export type SplitterRatio = typeof SPLITTER_RATIOS[number];

export const SPLITTER_TYPES = ['PLC', 'FBT'] as const;
export type SplitterType = typeof SPLITTER_TYPES[number];

// =====================================================
// ATTENUATION CONSTANTS
// =====================================================

export const ATTENUATION_CONSTANTS = {
  FIBER_LOSS_PER_KM: 0.35, // dB/km for SM fiber
  CONNECTOR_LOSS: 0.3, // dB per connector
  SPLICE_LOSS_FUSION: 0.05, // dB per fusion splice (typical)
  SPLICE_LOSS_MECHANICAL: 0.2, // dB per mechanical splice (typical)
  OLT_TX_POWER: 5, // dBm (typical GPON)
  ONU_SENSITIVITY: -28, // dBm (typical GPON Class B+)
  SAFETY_MARGIN: 3, // dB
};

// =====================================================
// TYPE INTERFACES
// =====================================================

export type CoreStatus = 'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'DAMAGED' | 'DARK';
export type SpliceType = 'FUSION' | 'MECHANICAL';
export type SpliceStatus = 'ACTIVE' | 'REPAIRED' | 'DAMAGED';
export type DeviceType = 'OLT' | 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP' | 'CUSTOMER';
export type UpstreamType = 'OLT' | 'OTB' | 'JC' | 'ODC' | 'ODP_PARENT' | 'ODP_SUB_PARENT';
export type ClosureType = 'INLINE' | 'BRANCHING' | 'TERMINAL';
export type FBTRatioType = 'even' | 'uneven';

// Fiber Cable
export interface FiberCable {
  id: string;
  code: string;
  name: string;
  cableType: CableType;
  tubeCount: number;
  coresPerTube: number;
  totalCores: number;
  outerDiameter?: number;
  manufacturer?: string;
  partNumber?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DAMAGED';
  notes?: string;
  tubes?: FiberTube[];
}

// Fiber Tube
export interface FiberTube {
  id: string;
  cableId: string;
  tubeNumber: number;
  colorCode: string;
  colorHex: string;
  coreCount: number;
  usedCores: number;
  availableCores: number;
  status: 'ACTIVE' | 'DAMAGED' | 'RESERVED';
  notes?: string;
  cores?: FiberCore[];
}

// Fiber Core
export interface FiberCore {
  id: string;
  tubeId: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: CoreStatus;
  assignedToType?: string;
  assignedToId?: string;
  attenuation?: number;
  notes?: string;
}

// Splice Point
export interface SplicePoint {
  id: string;
  deviceType: DeviceType;
  deviceId: string;
  trayNumber: number;
  incomingCoreId: string;
  outgoingCoreId: string;
  spliceType: SpliceType;
  insertionLoss?: number;
  reflectance?: number;
  spliceDate?: Date | string;
  splicedBy?: string;
  status: SpliceStatus;
  notes?: string;
}

// Cable Segment
export interface CableSegment {
  id: string;
  cableId: string;
  fromDeviceType: string;
  fromDeviceId: string;
  fromPort?: number;
  toDeviceType: string;
  toDeviceId: string;
  toPort?: number;
  lengthMeters: number;
  attenuationPerKm: number;
  calculatedAttenuation?: number;
  status: 'ACTIVE' | 'INACTIVE' | 'DAMAGED';
  installDate?: Date | string;
  notes?: string;
}

// Core Assignment History
export interface CoreAssignmentHistory {
  id: string;
  coreId: string;
  action: 'ASSIGN' | 'RELEASE' | 'TRANSFER' | 'DAMAGE' | 'REPAIR';
  previousStatus?: string;
  newStatus: string;
  previousAssignedToType?: string;
  previousAssignedToId?: string;
  newAssignedToType?: string;
  newAssignedToId?: string;
  performedBy?: string;
  reason?: string;
  createdAt: Date | string;
}

// =====================================================
// ODP HIERARCHY TYPES
// =====================================================

export type ODPType = 'PARENT' | 'SUB_PARENT' | 'LEAF' | 'STANDALONE';
export type ODPChildType = 'standalone' | 'child' | 'parent' | 'sub_parent';

export interface ODPHierarchy {
  id: string;
  name: string;
  code?: string;
  
  // Type classification
  odpType: ODPType;
  childType: ODPChildType;
  
  // Hierarchy level (0 = parent, 1 = sub_parent, 2+ = leaf)
  hierarchyLevel: number;
  
  // Connection
  upstreamType?: UpstreamType;
  upstreamId?: string;
  
  // For parent ODPs
  childOdps?: ODPHierarchy[];
  
  // Splitter config
  splitterRatio: string;
  splitterType: SplitterType;
  fbtRatioType?: FBTRatioType;
  fbtTapLoss?: number;
  fbtThroughLoss?: number;
  
  // Ports
  portCount: number;
  usedPorts?: number;
  availablePorts?: number;
  
  // Location
  latitude?: number;
  longitude?: number;
  address?: string;
}

// =====================================================
// TRACE PATH TYPES
// =====================================================

export interface TraceStep {
  deviceType: DeviceType;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  cableCode?: string;
  tubeNumber?: number;
  tubeColor?: string;
  coreNumber?: number;
  coreColor?: string;
  segmentLength?: number;
  spliceType?: SpliceType;
  spliceLoss?: number;
  splitterRatio?: string;
  splitterLoss?: number;
  cumulativeLength: number;
  cumulativeAttenuation: number;
}

export interface CoreTrace {
  customerId?: string;
  customerName?: string;
  path: TraceStep[];
  totalLength: number;
  totalAttenuation: number;
  signalAtEnd?: number;
  marginToThreshold?: number;
  isWithinBudget?: boolean;
}

export interface AttenuationResult {
  totalLength: number;
  fiberAttenuation: number;
  spliceCount: number;
  spliceAttenuation: number;
  connectorCount: number;
  connectorAttenuation: number;
  splitterCount: number;
  splitterAttenuation: number;
  totalAttenuation: number;
  signalAtEnd: number;
  marginToThreshold: number;
  isWithinBudget: boolean;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

export function getSplitterLoss(ratio: string, type: SplitterType = 'PLC'): number {
  if (type === 'PLC') {
    return PLC_SPLITTER_LOSS[ratio] || 0;
  }
  // For FBT even split
  if (ratio === '1:2') return 3.5;
  return PLC_SPLITTER_LOSS[ratio] || 0;
}

export function getFBTUnevenLoss(ratio: string, port: 'tap' | 'through'): number {
  return FBT_UNEVEN_LOSS[ratio]?.[port] || 0;
}

export function getFBTUnevenLossBoth(ratio: string): { high: number; low: number } {
  const loss = FBT_UNEVEN_LOSS[ratio];
  if (!loss) return { high: 0, low: 0 };
  return { 
    high: Math.max(loss.tap, loss.through),
    low: Math.min(loss.tap, loss.through)
  };
}

export function calculateSegmentAttenuation(lengthMeters: number, attenuationPerKm: number = 0.35): number {
  return (lengthMeters / 1000) * attenuationPerKm;
}

export function calculateTotalAttenuation(params: {
  fiberLengthKm: number;
  spliceCount: number;
  connectorCount: number;
  splitterRatios: string[];
  spliceType?: SpliceType;
}): AttenuationResult {
  const { 
    fiberLengthKm, 
    spliceCount, 
    connectorCount, 
    splitterRatios,
    spliceType = 'FUSION' 
  } = params;

  const fiberAttenuation = fiberLengthKm * ATTENUATION_CONSTANTS.FIBER_LOSS_PER_KM;
  const spliceLoss = spliceType === 'FUSION' 
    ? ATTENUATION_CONSTANTS.SPLICE_LOSS_FUSION 
    : ATTENUATION_CONSTANTS.SPLICE_LOSS_MECHANICAL;
  const spliceAttenuation = spliceCount * spliceLoss;
  const connectorAttenuation = connectorCount * ATTENUATION_CONSTANTS.CONNECTOR_LOSS;
  const splitterAttenuation = splitterRatios.reduce((sum, ratio) => sum + getSplitterLoss(ratio), 0);

  const totalAttenuation = fiberAttenuation + spliceAttenuation + connectorAttenuation + splitterAttenuation;
  const signalAtEnd = ATTENUATION_CONSTANTS.OLT_TX_POWER - totalAttenuation;
  const marginToThreshold = signalAtEnd - ATTENUATION_CONSTANTS.ONU_SENSITIVITY;
  const isWithinBudget = marginToThreshold >= ATTENUATION_CONSTANTS.SAFETY_MARGIN;

  return {
    totalLength: fiberLengthKm * 1000,
    fiberAttenuation,
    spliceCount,
    spliceAttenuation,
    connectorCount,
    connectorAttenuation,
    splitterCount: splitterRatios.length,
    splitterAttenuation,
    totalAttenuation,
    signalAtEnd,
    marginToThreshold,
    isWithinBudget,
  };
}

export function generateTubesForCable(tubeCount: number, coresPerTube: number): Omit<FiberTube, 'id' | 'cableId'>[] {
  const tubes: Omit<FiberTube, 'id' | 'cableId'>[] = [];
  
  for (let t = 1; t <= tubeCount; t++) {
    const color = getFiberColor(t);
    tubes.push({
      tubeNumber: t,
      colorCode: color.name.toUpperCase(),
      colorHex: color.hex,
      coreCount: coresPerTube,
      usedCores: 0,
      availableCores: coresPerTube,
      status: 'ACTIVE',
    });
  }
  
  return tubes;
}

export function generateCoresForTube(coreCount: number): Omit<FiberCore, 'id' | 'tubeId'>[] {
  const cores: Omit<FiberCore, 'id' | 'tubeId'>[] = [];
  
  for (let c = 1; c <= coreCount; c++) {
    const color = getFiberColor(c);
    cores.push({
      coreNumber: c,
      colorCode: color.name.toUpperCase(),
      colorHex: color.hex,
      status: 'AVAILABLE',
    });
  }
  
  return cores;
}

// Status color helpers for UI
export const CORE_STATUS_COLORS: Record<CoreStatus, { bg: string; text: string; border: string }> = {
  AVAILABLE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  ASSIGNED: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  RESERVED: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  DAMAGED: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  DARK: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
};

export const CORE_STATUS_LABELS: Record<CoreStatus, { en: string; id: string }> = {
  AVAILABLE: { en: 'Available', id: 'Tersedia' },
  ASSIGNED: { en: 'Assigned', id: 'Terpakai' },
  RESERVED: { en: 'Reserved', id: 'Dipesan' },
  DAMAGED: { en: 'Damaged', id: 'Rusak' },
  DARK: { en: 'Dark Fiber', id: 'Dark Fiber' },
};
