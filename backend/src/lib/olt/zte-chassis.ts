/** Parsers for ZTE CLI output, as the operator's NMS reads it. */

export interface ZteFan {
  number: number;
  rpm: number;
  active: boolean;
}

/** "show fan": rows under the "FanUnitId ... ActualSpeed" header are unit, speed level, rpm. */
export function parseShowFan(output: string): ZteFan[] {
  const fans: ZteFan[] = [];
  let inTable = false;
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (/FanUnitId/.test(line) && /ActualSpeed/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable || !line || line.startsWith('---')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[2])) {
      inTable = false;
      continue;
    }
    const rpm = Number(parts[2]);
    fans.push({ number: Number(parts[0]), rpm, active: rpm > 0 });
  }
  return fans;
}

export interface OpticalField {
  label: string;
  value: string;
}

const OPTICAL_LABELS: Array<[RegExp, string]> = [
  [/vendor-name/, 'Vendor'],
  [/vendor-pn/, 'Tipe'],
  [/vendor-sn/, 'Serial'],
  [/wavelength/, 'Panjang gelombang'],
  [/connector/, 'Konektor'],
  [/trans-distance/, 'Jangkauan'],
  [/^rxpower|[-_]rxpower/, 'Rx'],
  [/^txpower|[-_]txpower/, 'Tx'],
  [/txbias/, 'Bias'],
  [/temperature/, 'Suhu'],
  [/supply-vol/, 'Tegangan'],
];

/** "show interface optical-module-info": "Key : value" pairs, up to two per line. Alarm limits are skipped. */
export function parseOpticalModule(output: string): OpticalField[] {
  if (!/Optical module/i.test(output) || /%Error/i.test(output)) return [];

  const fields = new Map<string, string>();
  for (const line of output.split('\n')) {
    for (const match of line.matchAll(/(\S+)\s*:\s*(.+?)(?:\s{2,}|\s*$)/g)) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (!value || value === 'N/A' || /upper|lower/.test(key)) continue;
      const label = OPTICAL_LABELS.find(([pattern]) => pattern.test(key))?.[1];
      if (label && !fields.has(label)) fields.set(label, value);
    }
  }
  return [...fields].map(([label, value]) => ({ label, value }));
}
