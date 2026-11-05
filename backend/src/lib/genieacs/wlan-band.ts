/**
 * Which radio (2.4GHz or 5GHz) each WLANConfiguration slot of an ONT belongs to.
 *
 * TR-098 has no reliable "this slot is the 5GHz one" field, and ONTs differ
 * in what they do report. A live FiberHome HG6045F3 has 16 slots, all with the
 * same Standard and Channel 0: 1-8 are 2.4GHz, 9-16 are 5GHz, and the two real
 * networks are slots 1 and 9 under one SSID name.
 *
 * So signals are taken in order of how much they can be trusted:
 *   1. what the radio states: frequency band, a real Channel, PossibleChannels
 *   2. an SSID containing "5G" (the ONT's default names for its 5GHz slots)
 *   3. the same SSID enabled on two slots: one network on both radios
 *   4. Standard, which many ONTs report identically on every slot
 *   5. position: 2.4GHz slots come first, then an equal block of 5GHz slots
 */

export type Band = '2.4GHz' | '5GHz';

export interface WlanSlot {
  index: number;
  wlan: Record<string, unknown>;
  enabled: boolean;
}

const str = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && '_value' in (val as object)) return String((val as { _value: unknown })._value ?? '');
  return String(val ?? '');
};

export const isEnabledValue = (val: unknown): boolean => {
  const v = val && typeof val === 'object' && '_value' in (val as object) ? (val as { _value: unknown })._value : val;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  if (typeof v === 'number') return v === 1;
  return false;
};

/** What the radio itself states, or the ONT's own 5GHz naming. */
function statedBand(wlan: Record<string, unknown>): Band | null {
  for (const key of ['OperatingFrequencyBand', 'X_HW_OperatingFrequencyBand']) {
    const freq = str(wlan[key]).toLowerCase();
    if (freq.includes('5')) return '5GHz';
    if (freq.includes('2.4') || freq.includes('2g')) return '2.4GHz';
  }

  const channel = parseInt(str(wlan['Channel'])) || 0;
  if (channel > 14) return '5GHz';
  if (channel >= 1) return '2.4GHz';

  // Still answers when Channel is 0 (auto). A list spanning both bands says nothing.
  const possible = (str(wlan['PossibleChannels']).match(/\d+/g) ?? []).map(Number);
  if (possible.length > 0) {
    if (possible.every((c) => c > 14)) return '5GHz';
    if (possible.every((c) => c <= 14)) return '2.4GHz';
  }

  return str(wlan['SSID']).toLowerCase().includes('5g') ? '5GHz' : null;
}

/** Only 802.11a/ac are 5GHz-only and b/g 2.4GHz-only; n and ax run on either radio. */
function standardBand(standard: string): Band | null {
  if (standard.includes('ac') || standard === 'a') return '5GHz';
  if (standard.includes('b') || standard.includes('g')) return '2.4GHz';
  const tokens = standard.replace(/802\.?11/g, '').split(/[^a-z]+/).filter(Boolean);
  return tokens.includes('a') ? '5GHz' : null;
}

/** The band of every slot, by index. Pass all slots, also those without an SSID: their count matters. */
export function classifyWlanSlots(input: WlanSlot[]): Map<number, Band> {
  const slots = [...input].sort((a, b) => a.index - b.index);
  const bands = new Map<number, Band | null>(slots.map((s) => [s.index, statedBand(s.wlan)]));

  // One name enabled on two slots is one network on both radios: a radio does
  // not broadcast the same SSID twice. The lower slot is 2.4GHz.
  const byName = new Map<string, WlanSlot[]>();
  for (const s of slots) {
    const name = str(s.wlan['SSID']);
    if (s.enabled && name) byName.set(name, [...(byName.get(name) ?? []), s]);
  }
  for (const pair of byName.values()) {
    if (pair.length < 2) continue;
    const low = pair[0].index;
    const high = pair[pair.length - 1].index;
    if (!bands.get(low) && bands.get(high) !== '2.4GHz') bands.set(low, '2.4GHz');
    if (!bands.get(high) && bands.get(low) !== '5GHz') bands.set(high, '5GHz');
  }

  // Half of the slots, for ONTs that give each radio an equal block.
  const lastOfFirstHalf = slots[Math.ceil(slots.length / 2) - 1]?.index ?? 0;
  const dualBand =
    [...bands.values()].includes('5GHz') ||
    (slots.length >= 8 && slots.some((s) => s.enabled && s.index > lastOfFirstHalf));

  // A Standard shared by every slot cannot tell them apart. An ONT known to
  // have a 5GHz radio that still says "b,g" on all of them is simply
  // reporting one value; on a single-band ONT the same "b,g" is true.
  const standards = slots.map((s) => str(s.wlan['Standard']).toLowerCase());
  const uniform = slots.length >= 2 && standards[0] !== '' && standards.every((s) => s === standards[0]);
  slots.forEach((s, i) => {
    if (bands.get(s.index)) return;
    const band = standardBand(standards[i]);
    if (band === '5GHz' && !uniform) bands.set(s.index, band);
    if (band === '2.4GHz' && !(uniform && dualBand)) bands.set(s.index, band);
  });

  const items: BandItem[] = slots.map((s) => ({ index: s.index, band: bands.get(s.index) ?? null, enabled: s.enabled }));
  resolveUndeterminedBands(items);
  return new Map(items.map((i) => [i.index, i.band ?? '2.4GHz']));
}

interface BandItem {
  index: number;
  band: Band | null;
  enabled: boolean;
}

/** Places the slots with no signal by position. Slots that have a band are never changed. */
function resolveUndeterminedBands(items: BandItem[]): void {
  const known = items.filter((i) => i.band).sort((a, b) => a.index - b.index);
  const unknown = items.filter((i) => !i.band).sort((a, b) => a.index - b.index);
  if (unknown.length === 0) return;

  // Nothing is determined: split the slots in half, 2.4GHz first.
  if (known.length === 0) {
    const mid = Math.ceil(unknown.length / 2);
    unknown.forEach((item, i) => {
      item.band = i < mid ? '2.4GHz' : '5GHz';
    });
    return;
  }

  const has5 = known.some((k) => k.band === '5GHz');

  // Equal blocks per radio, when what is known fits that layout.
  const sorted = [...items].sort((a, b) => a.index - b.index);
  const boundary = sorted[Math.ceil(sorted.length / 2) - 1].index;
  const fitsHalves = known.every((k) => (k.band === '5GHz' ? k.index > boundary : k.index <= boundary));
  if (has5 && fitsHalves) {
    for (const item of unknown) item.band = item.index > boundary ? '5GHz' : '2.4GHz';
    return;
  }

  for (const item of unknown) {
    const prev = [...known].reverse().find((k) => k.index < item.index);
    const next = known.find((k) => k.index > item.index);

    if (prev && next && prev.band === next.band) item.band = prev.band;
    else if (prev?.band === '5GHz') item.band = '5GHz';
    else if (next?.band === '2.4GHz') item.band = '2.4GHz';
    else if (next?.band === '5GHz') item.band = '2.4GHz';
    else if (prev?.band === '2.4GHz' && !has5 && (item.enabled || item.index >= 5)) {
      // Only 2.4GHz slots are known and this one comes after them: the 5GHz
      // radio of a dual-band ONT. A disabled guest slot right after the main
      // 2.4GHz one (index < 5) is not taken for 5GHz.
      item.band = '5GHz';
    } else item.band = '2.4GHz';

    known.push(item);
    known.sort((a, b) => a.index - b.index);
  }
}
