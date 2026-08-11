/**
 * SNMP Client for OLT Monitoring
 * Uses system snmpget/snmpwalk CLI commands
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SNMPConfig {
  host: string;
  community: string;
  port?: number;
  version?: '1' | '2c' | '3';
  timeout?: number;
}

export interface SNMPResult {
  success: boolean;
  value?: string;
  error?: string;
}

export interface SNMPWalkResult {
  success: boolean;
  results?: Record<string, string>;
  error?: string;
}

/**
 * Get a single SNMP OID value
 */
export async function snmpGet(config: SNMPConfig, oid: string): Promise<SNMPResult> {
  const version = config.version || '2c';
  const port = config.port || 161;
  const timeout = config.timeout || 10;

  // -On forces numeric OID output (avoids "iso." prefix from MIB lookups)
  const command = `snmpget -On -v${version} -c ${config.community} -t ${timeout} ${config.host}:${port} ${oid} 2>&1`;

  try {
    const { stdout } = await execAsync(command);
    const output = stdout.trim();

    if (!output || output.includes('No Such Object') || output.includes('No Such Instance')) {
      return { success: false, error: 'OID not found' };
    }

    // Parse value — type may include hyphen (e.g. "Hex-STRING:", "Timeticks:")
    const match = output.match(/=\s*[\w-]+:\s*(.+)$/m);
    if (match) {
      return { success: true, value: match[1].trim().replace(/"/g, '') };
    }

    // For bare INTEGER values without type prefix
    const intMatch = output.match(/=\s*(\d+)$/m);
    if (intMatch) {
      return { success: true, value: intMatch[1] };
    }

    return { success: true, value: output };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Walk SNMP OID tree
 */
export async function snmpWalk(config: SNMPConfig, oid: string): Promise<SNMPWalkResult> {
  const version = config.version || '2c';
  const port = config.port || 161;
  const timeout = config.timeout || 30;

  // -On forces numeric OID output (avoids "iso." prefix and MIB name translations)
  const command = `snmpwalk -On -v${version} -c ${config.community} -t ${timeout} ${config.host}:${port} ${oid} 2>&1`;

  try {
    const { stdout } = await execAsync(command);
    const output = stdout.trim();

    if (!output) {
      return { success: false, error: 'No output from SNMP walk' };
    }

    const results: Record<string, string> = {};
    const lines = output.split('\n');

    for (const line of lines) {
      // Handle both ".1.3.6..." (with -On) and legacy "1.3.6..." numeric formats.
      // Type prefix may include hyphens (e.g. "Hex-STRING:", "Timeticks:").
      const match = line.match(/^\.?([\d][\d.]+)\s*=\s*(?:[\w-]+:\s*)?(.+)$/);
      if (match) {
        results[match[1].trim()] = match[2].trim().replace(/"/g, '');
      }
    }

    if (Object.keys(results).length === 0) {
      return { success: false, error: 'No parseable OIDs in SNMP walk output' };
    }

    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Test SNMP connectivity
 */
export async function testSNMP(config: SNMPConfig): Promise<boolean> {
  const result = await snmpGet(config, '1.3.6.1.2.1.1.1.0'); // sysDescr
  return result.success;
}

/**
 * Get system information via SNMP
 */
export async function getSystemInfo(config: SNMPConfig): Promise<{
  description?: string;
  uptime?: number;
  hostname?: string;
} | null> {
  try {
    const [descResult, uptimeResult, hostnameResult] = await Promise.all([
      snmpGet(config, '1.3.6.1.2.1.1.1.0'), // sysDescr
      snmpGet(config, '1.3.6.1.2.1.1.3.0'), // sysUpTime
      snmpGet(config, '1.3.6.1.2.1.1.5.0'), // sysName
    ]);

    let uptime: number | undefined;
    if (uptimeResult.success && uptimeResult.value) {
      // Timeticks format: "(12345) 0:00:00.00"
      const tickMatch = uptimeResult.value.match(/\((\d+)\)/);
      if (tickMatch) {
        uptime = Math.floor(parseInt(tickMatch[1]) / 100); // convert centiseconds to seconds
      }
    }

    return {
      description: descResult.value,
      uptime,
      hostname: hostnameResult.value,
    };
  } catch {
    return null;
  }
}
