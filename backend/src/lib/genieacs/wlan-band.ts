/**
 * Which radio (2.4GHz or 5GHz) each WLANConfiguration slot of an ONT belongs to.
 *
 * TR-098 has no reliable "this slot is the 5GHz one" field. Slots are told
 * apart by whatever the ONT reports, and many report very little:
 *   - OperatingFrequencyBand (and X_HW_…): exact when present, often absent
 *   - Standard: only 802.11ac and 802.11a are 5GHz-only. 11n and 11ax run on
 *     either radio, so a WiFi 6 ONT reporting "ax" for both says nothing
 *   - SSID containing "5G": only when the owner named it that way
 *   - Channel: 1-14 is 2.4GHz, above 14 is 5GHz, but 0 means "auto" on many
 *     ONTs, and auto is the usual setting for 5GHz
 *
 * A slot with none of these is "undetermined" and is placed by its position
 * among the slots that are determined, because ONTs list every 2.4GHz slot
 * before every 5GHz slot.
 */

export type Band = '2.4GHz' | '5GHz';

const str = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && '_value' in (val as object)) return String((val as { _value: unknown })._value ?? '');
  return String(val ?? '');
};

const truthy = (val: unknown): boolean => {
  const v = val && typeof val === 'object' && '_value' in (val as object) ? (val as { _value: unknown })._value : val;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  if (typeof v === 'number') return v === 1;
  return false;
};

/** The band one slot reports unambiguously, or null when it does not say. */
export function detectBandSignal(wlan: Record<string, unknown>): Band | null {
  for (const key of ['OperatingFrequencyBand', 'X_HW_OperatingFrequencyBand']) {
    const freq = str(wlan[key]).toLowerCase();
    if (!freq) continue;
    if (freq.includes('5')) return '5GHz';
    if (freq.includes('2.4') || freq.includes('2g')) return '2.4GHz';
  }

  // Same rules as before, so slots that were told apart keep their band.
  const standard = str(wlan['Standard']).toLowerCase();
  if (standard.includes('ac') || standard === 'a') return '5GHz';
  if (standard.includes('b') || standard.includes('g')) return '2.4GHz';
  // New: "a,n" and "11a/n" are 5GHz too. Bare n and ax still say nothing.
  const tokens = standard
    .replace(/802.?11/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (tokens.includes('a')) return '5GHz';

  const ssid = str(wlan['SSID']).toLowerCase();
  if (ssid.includes('5g')) return '5GHz';

  const channel = parseInt(str(wlan['Channel'])) || 0;
  if (channel > 14) return '5GHz';
  if (channel >= 1) return '2.4GHz';

  return null;
}

export interface BandItem {
  index: number;
  band: Band | null;
  enabled: boolean;
}

/**
 * Fills in `band` for every item that has none. Items that already have a
 * band are never changed.
 */
export function resolveUndeterminedBands(items: BandItem[]): void {
  const known = items.filter((i) => i.band).sort((a, b) => a.index - b.index);
  const unknown = items.filter((i) => !i.band).sort((a, b) => a.index - b.index);
  if (unknown.length === 0) return;

  // Nothing is determined: split the slots in half, 2.4GHz first.
  if (known.length === 0) {
    if (unknown.length === 1) {
      unknown[0].band = '2.4GHz';
      return;
    }
    const mid = Math.ceil(unknown.length / 2);
    unknown.forEach((item, i) => {
      item.band = i < mid ? '2.4GHz' : '5GHz';
    });
    return;
  }

  const has5 = known.some((k) => k.band === '5GHz');
  for (const item of unknown) {
    const prev = [...known].reverse().find((k) => k.index < item.index);
    const next = known.find((k) => k.index > item.index);

    if (prev && next && prev.band === next.band) item.band = prev.band;
    else if (prev?.band === '5GHz') item.band = '5GHz';
    else if (next?.band === '2.4GHz') item.band = '2.4GHz';
    else if (next?.band === '5GHz') item.band = '2.4GHz';
    else if (prev?.band === '2.4GHz' && !has5 && (item.enabled || item.index >= 5)) {
      // Only 2.4GHz slots are known and this one comes after them: the 5GHz
      // radio of a dual-band ONT. An unnamed, disabled guest slot right after
      // the main 2.4GHz one (index < 5) is not taken for 5GHz.
      item.band = '5GHz';
    } else item.band = '2.4GHz';

    // Later undetermined slots are placed relative to this one as well.
    known.push(item);
    known.sort((a, b) => a.index - b.index);
  }
}

export const isEnabledValue = truthy;
