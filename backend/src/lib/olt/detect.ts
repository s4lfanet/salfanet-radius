/**
 * Which OLT brand is this, from what it says about itself over SNMP.
 *
 * sysObjectID carries the vendor's enterprise number, which is the most reliable hint;
 * sysDescr is checked first because some firmware reports a generic enterprise.
 */

export type OltVendorKey = 'huawei' | 'zte' | 'fiberhome' | 'bdcom' | 'raisecom' | 'hioso' | 'cdata' | 'hsgq' | 'vsol';

const ENTERPRISE: Record<number, OltVendorKey> = {
  2011: 'huawei',
  3902: 'zte',
  5875: 'fiberhome',
  3320: 'bdcom',
  8886: 'raisecom',
  25355: 'hioso',
  17409: 'cdata',
  34592: 'cdata',
  37950: 'vsol',
  50224: 'hsgq',
};

const DESCRIPTION: Array<[RegExp, OltVendorKey]> = [
  [/hsgq/i, 'hsgq'],
  [/v-?sol|v1600/i, 'vsol'],
  [/hioso|ha73\d\d/i, 'hioso'],
  [/c-?data|\bfd1[16]\d\d/i, 'cdata'],
  [/huawei|ma5[6-8]\d\d/i, 'huawei'],
  [/zte|zxa10|c[36][012]0/i, 'zte'],
  [/fiberhome|an55\d\d/i, 'fiberhome'],
  [/bdcom/i, 'bdcom'],
  [/raisecom/i, 'raisecom'],
];

export function enterpriseOf(sysObjectId: string | null | undefined): number | null {
  const match = (sysObjectId ?? '').match(/1\.3\.6\.1\.4\.1\.(\d+)/);
  return match ? Number(match[1]) : null;
}

export function detectVendor(input: { sysObjectId?: string | null; sysDescr?: string | null }): OltVendorKey | null {
  const text = input.sysDescr ?? '';
  for (const [pattern, vendor] of DESCRIPTION) if (pattern.test(text)) return vendor;
  const enterprise = enterpriseOf(input.sysObjectId);
  return enterprise !== null ? (ENTERPRISE[enterprise] ?? null) : null;
}

/** Brands worth trying, in this order, when nothing identifies the OLT. */
export const PROBE_ORDER: OltVendorKey[] = ['cdata', 'hsgq', 'vsol', 'hioso'];
