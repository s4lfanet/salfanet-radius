/**
 * Colour of a voucher template, kept in one CSS line inside the template:
 *   .vc-theme { --vc-warna: #1d4ed8; --vc-teks: #ffffff; }
 * The editor's colour picker rewrites only that line, so changing colour
 * never means editing the card HTML.
 */

export const VOUCHER_COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#1d4ed8', name: 'Biru' },
  { hex: '#0f766e', name: 'Tosca' },
  { hex: '#15803d', name: 'Hijau' },
  { hex: '#ea580c', name: 'Oranye' },
  { hex: '#ff8c00', name: 'Oranye terang' },
  { hex: '#dc2626', name: 'Merah' },
  { hex: '#db2777', name: 'Pink' },
  { hex: '#7c3aed', name: 'Ungu' },
  { hex: '#111111', name: 'Hitam' },
];

const THEME_RE = /(\.vc-theme\s*\{[^}]*?--vc-warna:\s*)(#[0-9a-fA-F]{3,8})([^}]*?--vc-teks:\s*)(#[0-9a-fA-F]{3,8})/;

/** Current template colour, or null when the template has no colour line. */
export function getVoucherColor(html: string): string | null {
  const m = html.match(THEME_RE);
  return m ? m[2].toLowerCase() : null;
}

/** Text colour that stays readable on `hex` (same 0.179 luminance cut as WCAG contrast). */
export function readableTextOn(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#111111' : '#ffffff';
}

export function setVoucherColor(html: string, hex: string): string {
  return html.replace(THEME_RE, (_, a, _old, b) => `${a}${hex}${b}${readableTextOn(hex)}`);
}

/**
 * The original built-in card (orange #ff8c00, hard-coded inline) predates the
 * colour line. Templates still on that design can be converted in place.
 */
export function canEnableVoucherColor(html: string): boolean {
  return !getVoucherColor(html) && /#ff8c00/i.test(html) && /voucher-card/.test(html);
}

export function enableVoucherColor(html: string): string {
  const themeLine = '/* WARNA: cukup ubah --vc-warna (dan --vc-teks = warna tulisan di atasnya). */\n.vc-theme { --vc-warna: #ff8c00; --vc-teks: #ffffff; }\n';
  let out = html
    .replace(/class="voucher-card /g, 'class="vc-theme voucher-card ')
    .replace(/background:\s*#ff8c00;\s*color:\s*#fff;/gi, 'background: var(--vc-warna); color: var(--vc-teks);')
    .replace(/color:\s*#ff8c00;/gi, 'color: color-mix(in srgb, var(--vc-warna) 80%, #000000);')
    .replace(/1px dashed #ffa500;/gi, '1px dashed var(--vc-warna);')
    .replace(/background:\s*#fffaf0;/gi, 'background: color-mix(in srgb, var(--vc-warna) 8%, #ffffff);');
  out = /<style>/.test(out) ? out.replace('<style>', `<style>\n${themeLine}`) : out.replace(/(\{include file="rad-template-header\.tpl"\}\n?)/, `$1<style>\n${themeLine}</style>\n`);
  return out;
}
