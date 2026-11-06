/**
 * What an OLT answers, for the connection test: brand, reader, and how many ONUs came back.
 * The point is to show on a real device what was found, since OID tables differ by firmware.
 */
import type { SNMPConfig } from './snmp';
import { detectVendor, PROBE_ORDER, type OltVendorKey } from './detect';
import { getVendorModule } from './vendors/modules';
import { identify } from './vendors/auto';

export interface OltScan {
  sysDescr: string | null;
  sysObjectId: string | null;
  vendor: OltVendorKey | null;
  profile: string | null;
  onuCount: number;
  onlineCount: number;
}

export async function scanOlt(config: SNMPConfig): Promise<OltScan> {
  const quick: SNMPConfig = { ...config, timeout: 5 };
  const { sysObjectId, sysDescr } = await identify(quick);
  const identified = detectVendor({ sysObjectId, sysDescr });

  const candidates = identified ? [identified] : PROBE_ORDER;
  for (const vendor of candidates) {
    const reader: any = getVendorModule(vendor);
    const onus: any[] = (await reader.discoverONUsSNMP?.(quick).catch(() => [])) ?? [];
    if (onus.length > 0) {
      return {
        sysDescr,
        sysObjectId,
        vendor,
        profile: onus[0]?.profile ?? null,
        onuCount: onus.length,
        onlineCount: onus.filter((o) => o.status === 'online').length,
      };
    }
  }
  return { sysDescr, sysObjectId, vendor: identified, profile: null, onuCount: 0, onlineCount: 0 };
}

export function describeScan(scan: OltScan): string {
  const brand = scan.vendor ? scan.vendor.toUpperCase() : 'tidak dikenali';
  if (scan.onuCount === 0) {
    return `Merek: ${brand}. Tabel ONU belum terbaca lewat SNMP (cek community, versi SNMP, atau pilih merek manual).`;
  }
  const how = scan.profile ? ` (profil ${scan.profile})` : '';
  return `Merek: ${brand}${how}. Terbaca ${scan.onuCount} ONU, ${scan.onlineCount} online.`;
}
