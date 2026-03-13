import { prisma } from '@/server/db/client';

// Cache pentru isolation settings
let isolationSettingsCache: {
  isolationEnabled: boolean;
  isolationIpPool: string;
  isolationServerIp?: string;
  isolationRateLimit: string;
  isolationRedirectUrl?: string;
  isolationAllowDns: boolean;
  isolationAllowPayment: boolean;
  gracePeriodDays: number;
  lastFetched: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Get isolation settings from database with caching
 */
export async function getIsolationSettings() {
  try {
    // Check cache first
    if (isolationSettingsCache && 
        (Date.now() - isolationSettingsCache.lastFetched) < CACHE_TTL) {
      return isolationSettingsCache;
    }

    // Fetch from database
    const company = await prisma.company.findFirst({
      select: {
        isolationEnabled: true,
        isolationIpPool: true,
        isolationServerIp: true,
        isolationRateLimit: true,
        isolationRedirectUrl: true,
        isolationAllowDns: true,
        isolationAllowPayment: true,
        gracePeriodDays: true,
      }
    });

    if (!company) {
      // Default settings if no company record
      const defaultSettings = {
        isolationEnabled: true,
        isolationIpPool: '192.168.200.0/24',
        isolationRateLimit: '128k/128k',
        isolationRedirectUrl: '',
        isolationAllowDns: true,
        isolationAllowPayment: true,
        gracePeriodDays: 0,
        lastFetched: Date.now(),
      };
      isolationSettingsCache = defaultSettings;
      return defaultSettings;
    }

    // Cache the settings
    isolationSettingsCache = {
      isolationEnabled: company.isolationEnabled ?? true,
      isolationIpPool: company.isolationIpPool ?? '192.168.200.0/24',
      isolationServerIp: company.isolationServerIp ?? undefined,
      isolationRateLimit: company.isolationRateLimit ?? '128k/128k',
      isolationRedirectUrl: company.isolationRedirectUrl ?? '',
      isolationAllowDns: company.isolationAllowDns ?? true,
      isolationAllowPayment: company.isolationAllowPayment ?? true,
      gracePeriodDays: company.gracePeriodDays ?? 0,
      lastFetched: Date.now(),
    };

    return isolationSettingsCache;
  } catch (error) {
    console.error('[Isolation Settings] Error fetching settings:', error);
    
    // Return default settings on error
    const defaultSettings = {
      isolationEnabled: true,
      isolationIpPool: '192.168.200.0/24',
      isolationRateLimit: '128k/128k',
      isolationRedirectUrl: '',
      isolationAllowDns: true,
      isolationAllowPayment: true,
      gracePeriodDays: 0,
      lastFetched: Date.now(),
    };
    
    return defaultSettings;
  }
}

/**
 * Check if an IP address is in the isolation pool
 */
export function isIpInIsolationPool(ipAddress: string, isolationPool: string): boolean {
  try {
    if (!ipAddress || !isolationPool) return false;

    // Parse CIDR notation (e.g., "192.168.200.0/24")
    const [networkAddr, subnetMask] = isolationPool.split('/');
    if (!networkAddr || !subnetMask) {
      // Fallback: simple prefix matching
      return ipAddress.startsWith(networkAddr.split('.').slice(0, 3).join('.'));
    }

    const mask = parseInt(subnetMask);
    
    // Convert IP addresses to numbers
    const ipToNumber = (ip: string) => {
      return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
    };

    const networkNumber = ipToNumber(networkAddr);
    const ipNumber = ipToNumber(ipAddress);
    
    // Create subnet mask
    const subnetNumber = (0xFFFFFFFF << (32 - mask)) >>> 0;
    
    // Check if IP is in the network
    return (ipNumber & subnetNumber) === (networkNumber & subnetNumber);
  } catch (error) {
    console.error('[Isolation] Error checking IP in pool:', error);
    // Fallback: simple prefix matching for common cases
    if (isolationPool.startsWith('192.168.200')) {
      return ipAddress.startsWith('192.168.200');
    }
    return false;
  }
}

/**
 * Get IP range from CIDR notation for MikroTik pool configuration
 */
export function getCidrRange(cidr: string): { startIp: string; endIp: string; gateway: string } {
  try {
    const [networkAddr, subnetMask] = cidr.split('/');
    if (!networkAddr || !subnetMask) {
      throw new Error('Invalid CIDR format');
    }

    const mask = parseInt(subnetMask);
    const hostBits = 32 - mask;
    const numHosts = Math.pow(2, hostBits) - 2; // Exclude network and broadcast

    // Convert network address to number
    const networkParts = networkAddr.split('.').map(x => parseInt(x));
    let networkNumber = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];

    // Gateway is typically first usable IP (network + 1)
    const gatewayNumber = networkNumber + 1;
    
    // Start of pool (skip gateway, so network + 2 or configurable)
    const startNumber = networkNumber + 100; // Start from .100 for pool
    
    // End of pool (before broadcast)
    const broadcastNumber = networkNumber + Math.pow(2, hostBits) - 1;
    const endNumber = Math.min(startNumber + 100, broadcastNumber - 1); // Max 100 IPs in pool

    // Convert back to IP strings
    const numberToIp = (num: number) => [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255
    ].join('.');

    return {
      startIp: numberToIp(startNumber),
      endIp: numberToIp(endNumber),
      gateway: numberToIp(gatewayNumber)
    };
  } catch (error) {
    console.error('[Isolation] Error parsing CIDR:', error);
    // Default fallback
    return {
      startIp: '192.168.200.100',
      endIp: '192.168.200.200',
      gateway: '192.168.200.1'
    };
  }
}

/**
 * Clear isolation settings cache (useful after settings update)
 */
export function clearIsolationSettingsCache() {
  isolationSettingsCache = null;
}