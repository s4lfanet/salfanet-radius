// Network Splitter Diagram Types
// Re-export fiber core types for convenience
export * from '@/lib/network/fiber-core-types';

export type NodeType = 'OLT' | 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP' | 'CUSTOMER';

export type PortStatus = 'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'DAMAGED' | 'MAINTENANCE';

// Tube-Core visualization types
export interface TubeVisualization {
  id: string;
  tubeNumber: number;
  colorCode: string;
  colorHex: string;
  cores: CoreVisualization[];
  usedCores: number;
  totalCores: number;
}

export interface CoreVisualization {
  id: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: PortStatus | 'DARK';
  assignedTo?: string;
  assignedToType?: string;
}

export interface Port {
  id: string;
  number: number;
  status: PortStatus;
  assignedTo?: string; // customer name, ODC code, ODP code
  assignedId?: string;
  signalStrength?: number; // dBm
  notes?: string;
  metadata?: any;
  installedAt?: Date | string;
  // New core-level fields
  tubeNumber?: number;
  coreNumber?: number;
  tubeColor?: string;
  coreColor?: string;
}

export interface FiberConnection {
  from: string; // port id
  to: string; // port id or node id
  type: 'UPSTREAM' | 'DOWNSTREAM';
  fiberType?: string; // SM (single-mode), MM (multi-mode)
  length?: number; // meters
  color?: string; // fiber color code
  // New core-level fields
  tubeNumber?: number;
  coreNumber?: number;
  attenuation?: number; // dB
}

export interface SplitterNode {
  id: string;
  code: string;
  name: string;
  type: NodeType;
  latitude?: string;
  longitude?: string;
  address?: string;
  
  // Splitter configuration
  inputPorts: number; // usually 1 or 2
  outputPorts: number; // 8, 16, 32, 64, etc.
  splittingRatio: string; // "1:8", "1:16", etc.
  splitterType?: 'PLC' | 'FBT';
  fiberCount?: number; // total fiber count (for Joint Closure)
  
  // Connections
  upstreamNode?: {
    id: string;
    type: NodeType;
    code: string;
  };
  
  // Port details
  ports: Port[];
  connections: FiberConnection[];
  
  // Status
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  installDate?: Date;
  lastMaintenance?: Date;
  metadata?: any;

  // New fiber core fields
  incomingCable?: {
    id: string;
    code: string;
    name: string;
    tubes?: TubeVisualization[];
  };
  spliceTrayCount?: number;
  totalSpliceCapacity?: number;
}

export interface DiagramProps {
  node: SplitterNode;
  width?: number;
  height?: number;
  interactive?: boolean;
  showLabels?: boolean;
  onPortClick?: (port: Port) => void;
  onPortHover?: (port: Port | null) => void;
  selectedPorts?: string[]; // array of port ids
}

export interface DiagramColors {
  available: string;
  assigned: string;
  reserved: string;
  damaged: string;
  maintenance: string;
  upstream: string;
  downstream: string;
  background: string;
  border: string;
  text: string;
}

export const DEFAULT_COLORS: DiagramColors = {
  available: '#10b981', // green-500
  assigned: '#3b82f6', // blue-500
  reserved: '#f59e0b', // amber-500
  damaged: '#ef4444', // red-500
  maintenance: '#6b7280', // gray-500
  upstream: '#8b5cf6', // violet-500
  downstream: '#06b6d4', // cyan-500
  background: '#ffffff',
  border: '#e5e7eb', // gray-200
  text: '#111827', // gray-900
};

export const PORT_STATUS_LABELS: Record<PortStatus, string> = {
  AVAILABLE: 'Tersedia',
  ASSIGNED: 'Terpakai',
  RESERVED: 'Dipesan',
  DAMAGED: 'Rusak',
  MAINTENANCE: 'Maintenance',
};

export const FIBER_COLORS = [
  '#3b82f6', // blue
  '#f97316', // orange
  '#10b981', // green
  '#ef4444', // red
  '#ffffff', // white
  '#6b7280', // gray
  '#fbbf24', // yellow
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#84cc16', // lime
];
