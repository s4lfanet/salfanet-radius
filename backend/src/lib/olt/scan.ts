/**
 * What an OLT answers, for the connection test: brand, reader, how many ONUs came back,
 * and for each candidate profile how many rows every column returned. The point is to show
 * on a real device where the gap is, since OID tables differ by firmware and model.
 */
import type { SNMPConfig } from './snmp';
import { detectVendor, PROBE_ORDER, type OltVendorKey } from './detect';
import { profileCoverage, type PonProfile } from './pon-snmp';
import { CDATA_PROFILES, HSGQ_PROFILES, NSCRTV_EPON, VSOL_G } from './profiles';
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

const PROFILES: Partial<Record<OltVendorKey, PonProfile[]>> = {
  cdata: CDATA_PROFILES,
  hioso: [NSCRTV_EPON],
  hsgq: HSGQ_PROFILES,
  vsol: [VSOL_G],
};

const COLUMN_LABEL: Record<string, string> = {
  name: 'nama',
  serial: 'serial',
  mac: 'MAC',
  distance: 'jarak',
  rx: 'Rx',
  tx: 'Tx',
  oltRx: 'Rx sisi OLT',
  downCause: 'penyebab mati',
  dyingGasp: 'dying gasp',
};

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

/** One line per profile that answers: rows per column, so an empty column stands out. */
export async function coverageLines(config: SNMPConfig, vendor: OltVendorKey | null): Promise<string[]> {
  const quick: SNMPConfig = { ...config, timeout: 5 };
  const profiles = vendor ? (PROFILES[vendor] ?? []) : [...CDATA_PROFILES, ...HSGQ_PROFILES, VSOL_G];
  const lines: string[] = [];
  for (const profile of profiles) {
    const coverage = await profileCoverage(quick, profile).catch(() => null);
    if (!coverage) continue;
    const columns = Object.entries(coverage.counts)
      .filter(([name]) => name !== 'status')
      .map(([name, rows]) => `${COLUMN_LABEL[name] ?? name} ${rows}`)
      .join(', ');
    lines.push(`- ${profile.id} (${coverage.tech}): ${coverage.counts.status} ONU; ${columns}`);
  }
  return lines;
}

/** The full text shown by Uji Koneksi after SNMP connects. */
export async function snmpDiagnosis(config: SNMPConfig): Promise<string> {
  const scan = await scanOlt(config);
  const lines = await coverageLines(config, scan.vendor);
  const detail = lines.length > 0 ? `\nBaris data per kolom (0 berarti kolom itu kosong di OLT ini):\n${lines.join('\n')}` : '';
  return describeScan(scan) + detail;
}
