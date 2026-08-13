/**
 * Helper functions untuk sync antara dedicated tables dan network_nodes (unified map)
 * Digunakan oleh API endpoints untuk auto-sync data ke unified topology map
 */

interface JointClosureData {
  id: string;
  code: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  cableType: string;
  fiberCount: number;
  hasSplitter: boolean;
  splitterRatio?: string | null;
  installDate?: Date | null;
  connections?: any;
}

interface ODCData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  oltId?: string | null;
  ponPort?: string | null;
  portCount: number;
  installDate?: Date | null;
}

interface ODPData {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  odcId?: string | null;
  portCount: number;
  installDate?: Date | null;
}

/**
 * Generate ports structure untuk Joint Closure
 * Tergantung pada fiberCount dan hasSplitter
 */
export function generateJCPorts(jc: JointClosureData) {
  const ports = [];
  
  // Input ports (upstream dari OLT atau JC lain)
  const inputCount = jc.hasSplitter ? 2 : 1;
  for (let i = 1; i <= inputCount; i++) {
    ports.push({
      id: `${jc.code}-in${i}`,
      number: i,
      status: 'AVAILABLE',
      type: 'INPUT',
      connectedTo: null,
    });
  }
  
  // Output ports (downstream ke ODC atau JC lain)
  const outputCount = jc.fiberCount || 24;
  for (let i = 1; i <= outputCount; i++) {
    ports.push({
      id: `${jc.code}-out${i}`,
      number: i + inputCount,
      status: 'AVAILABLE',
      type: 'OUTPUT',
      connectedTo: null,
    });
  }
  
  return ports;
}

/**
 * Generate ports structure untuk ODC
 */
export function generateODCPorts(odc: ODCData) {
  const ports = [];
  const portCount = odc.portCount || 8;
  
  for (let i = 1; i <= portCount; i++) {
    ports.push({
      id: `ODC-${odc.id}-port${i}`,
      number: i,
      status: 'AVAILABLE',
      type: 'OUTPUT',
      connectedTo: null,
    });
  }
  
  return ports;
}

/**
 * Generate ports structure untuk ODP
 */
export function generateODPPorts(odp: ODPData) {
  const ports = [];
  const portCount = odp.portCount || 8;
  
  for (let i = 1; i <= portCount; i++) {
    ports.push({
      id: `${odp.code}-port${i}`,
      number: i,
      status: 'AVAILABLE',
      type: 'OUTPUT',
      connectedTo: null,
    });
  }
  
  return ports;
}

/**
 * Generate unique code untuk ODC (jika belum ada)
 */
export function generateODCCode(odc: ODCData): string {
  // Format: ODC-{AREA}-{NUMBER}
  // Extract area dari nama atau gunakan ID
  const areaMatch = odc.name.match(/([A-Z]+)/);
  const area = areaMatch ? areaMatch[1] : 'AREA';
  const idSuffix = odc.id.slice(-4).toUpperCase();
  
  return `ODC-${area}-${idSuffix}`;
}

/**
 * Prepare metadata untuk Joint Closure di network_nodes
 */
export function prepareJCMetadata(jc: JointClosureData) {
  return {
    cableType: jc.cableType,
    fiberCount: jc.fiberCount,
    hasSplitter: jc.hasSplitter,
    splitterRatio: jc.splitterRatio,
    installDate: jc.installDate?.toISOString(),
    connections: jc.connections,
    ports: generateJCPorts(jc),
    entityType: 'JOINT_CLOSURE',
    jcType: jc.type, // CORE, DISTRIBUTION, FEEDER
  };
}

/**
 * Prepare metadata untuk ODC di network_nodes
 */
export function prepareODCMetadata(odc: ODCData) {
  return {
    oltId: odc.oltId,
    ponPort: odc.ponPort,
    portCount: odc.portCount,
    installDate: odc.installDate?.toISOString(),
    ports: generateODCPorts(odc),
    entityType: 'ODC',
  };
}

/**
 * Prepare metadata untuk ODP di network_nodes
 */
export function prepareODPMetadata(odp: ODPData) {
  return {
    odcId: odp.odcId,
    portCount: odp.portCount,
    installDate: odp.installDate?.toISOString(),
    ports: generateODPPorts(odp),
    entityType: 'ODP',
  };
}
