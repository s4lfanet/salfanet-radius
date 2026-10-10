/**
 * Built-in voucher print templates. Every colour comes from one line,
 * `.vc-theme { --vc-warna: …; --vc-teks: … }`, which the template editors'
 * colour picker rewrites (see voucherTemplateColor in the frontend/app).
 *
 * Same Smarty-style syntax the renderer in
 * lib/utils/templateRenderer.ts understands.
 *
 * Printing goes through getPrintableHtml(): A4 portrait, @page margin 5mm,
 * body padding 3mm, so the usable area is 194 × 281 mm. Card sizes below are
 * in mm so the count per sheet is exact, not dependent on screen DPI:
 *   - Kartu Standar 50 and Ringkas 50: 5 × 10 cards of 37.5 × 26.5 mm (+0.5 mm margin) = 192.5 × 275 mm
 *   - Mini 60:    5 × 12 cards of 37.5 × 22 mm   (+0.5 mm margin) = 192.5 × 270 mm
 */

export interface VoucherTemplatePreset {
  key: string;
  name: string;
  description: string;
  perA4: number;
  htmlTemplate: string;
}

const STANDARD = `{include file="rad-template-header.tpl"}
<style>
/* WARNA: cukup ubah --vc-warna (dan --vc-teks = warna tulisan di atasnya). */
.vc-theme { --vc-warna: #ff8c00; --vc-teks: #ffffff; }
@media (max-width: 640px) {
  .voucher-preview-container { display: flex !important; flex-direction: column !important; padding: 0 8px !important; gap: 10px !important; }
  .voucher-card { display: block !important; width: calc(100% - 16px) !important; max-width: none !important; margin: 0 auto 10px auto !important; }
  .voucher-single { order: 1; }
  .voucher-dual { order: 2; }
  .voucher-header { font-size: 12px !important; padding: 6px 10px !important; }
  .voucher-label { font-size: 9px !important; }
  .voucher-code-single { font-size: 13px !important; }
  .voucher-code-dual { font-size: 10px !important; }
  .voucher-footer { font-size: 10px !important; padding: 6px 10px !important; }
}
@media (min-width: 641px) and (max-width: 1024px) {
  .voucher-card { width: calc(33.33% - 8px) !important; }
}
@media (min-width: 1025px) {
  .voucher-card { width: 155px !important; }
}
</style>
{foreach $v as $vs}
{if $vs['code'] eq $vs['secret']}
<div class="vc-theme voucher-card voucher-single" style="display: inline-block; width: 155px; height: auto; min-height: 115px; border: 1px solid #ccc; border-radius: 4px; font-family: Arial, sans-serif; margin: 4px; padding: 0; vertical-align: top; background: #fff; page-break-inside: avoid; box-sizing: border-box;">
<div class="voucher-header" style="background: var(--vc-warna); color: var(--vc-teks); padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 3px 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
{$vs['router_name']}
</div>
<div style="padding: 8px 10px; min-height: 50px;">
<div class="voucher-label" style="color: color-mix(in srgb, var(--vc-warna) 80%, #000000); font-size: 10px; font-weight: 600; margin-bottom: 3px;">Kode Voucher</div>
<div class="voucher-code-single" style="font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; color: #000; line-height: 1.4; word-break: break-all;">{$vs['code']}</div>
</div>
<div class="voucher-footer" style="border-top: 1px dashed var(--vc-warna); padding: 7px 10px; font-size: 11px; font-weight: bold; color: #333; background: color-mix(in srgb, var(--vc-warna) 8%, #ffffff);">
{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}
</div>
<div style="padding: 5px 10px; font-size: 9px; color: #666; background: #f9f9f9; border-top: 1px solid #eee;">
<div>Kuota: {$vs['quota']}</div>
<div>Durasi: {$vs['duration']}</div>
</div>
</div>
{else}
<div class="vc-theme voucher-card voucher-dual" style="display: inline-block; width: 155px; height: auto; min-height: 115px; border: 1px solid #ccc; border-radius: 4px; font-family: Arial, sans-serif; margin: 4px; padding: 0; vertical-align: top; background: #fff; page-break-inside: avoid; box-sizing: border-box;">
<div class="voucher-header" style="background: var(--vc-warna); color: var(--vc-teks); padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 3px 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
{$vs['router_name']}
</div>
<div style="padding: 8px 10px; min-height: 50px; display: flex; gap: 6px;">
<div style="flex: 1; min-width: 0;">
<div class="voucher-label" style="color: color-mix(in srgb, var(--vc-warna) 80%, #000000); font-size: 10px; font-weight: 600; margin-bottom: 2px;">Username</div>
<div class="voucher-code-dual" style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; color: #000; line-height: 1.3; word-break: break-all;">{$vs['code']}</div>
</div>
<div style="flex: 1; min-width: 0;">
<div class="voucher-label" style="color: color-mix(in srgb, var(--vc-warna) 80%, #000000); font-size: 10px; font-weight: 600; margin-bottom: 2px;">Password</div>
<div class="voucher-code-dual" style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; color: #000; line-height: 1.3; word-break: break-all;">{$vs['secret']}</div>
</div>
</div>
<div class="voucher-footer" style="border-top: 1px dashed var(--vc-warna); padding: 7px 10px; font-size: 11px; font-weight: bold; color: #333; background: color-mix(in srgb, var(--vc-warna) 8%, #ffffff);">
{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}
</div>
<div style="padding: 5px 10px; font-size: 9px; color: #666; background: #f9f9f9; border-top: 1px solid #eee;">
<div>Kuota: {$vs['quota']}</div>
<div>Durasi: {$vs['duration']}</div>
</div>
</div>
{/if}
{/foreach}
{include file="rad-template-footer.tpl"}`;

// The standard orange card scaled to 5 × 10 per A4: same parts (header,
// label, dashed price strip, quota/duration line) at 37.5 × 26.5 mm.
const STANDARD_50 = `{include file="rad-template-header.tpl"}
<style>
/* WARNA: cukup ubah --vc-warna (dan --vc-teks = warna tulisan di atasnya). */
.vc-theme { --vc-warna: #ff8c00; --vc-teks: #ffffff; }
.vs50 { display: inline-flex; flex-direction: column; width: 37.5mm; height: 26.5mm; margin: 0.5mm; border: 0.25mm solid #cccccc; border-radius: 1mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; overflow: hidden; vertical-align: top; page-break-inside: avoid; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.vs50-head { background: var(--vc-warna); color: var(--vc-teks); font-size: 6.5pt; font-weight: bold; padding: 0.7mm 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vs50-body { padding: 0.8mm 1.5mm 0; }
.vs50-label { color: color-mix(in srgb, var(--vc-warna) 80%, #000000); font-size: 5.5pt; font-weight: 600; }
.vs50-code { font-family: 'Courier New', monospace; font-size: 12pt; font-weight: bold; line-height: 1.2; word-break: break-all; }
.vs50-pair { display: flex; gap: 1mm; }
.vs50-pair > div { flex: 1; min-width: 0; }
.vs50-pair .vs50-code { font-size: 7.5pt; line-height: 1.25; }
.vs50-foot { margin-top: auto; border-top: 0.25mm dashed var(--vc-warna); background: color-mix(in srgb, var(--vc-warna) 8%, #ffffff); padding: 0.5mm 1.5mm; font-size: 6.5pt; font-weight: bold; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vs50-info { background: #f9f9f9; border-top: 0.2mm solid #eeeeee; padding: 0.4mm 1.5mm; font-size: 5pt; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
{foreach $v as $vs}
{if $vs['code'] eq $vs['secret']}
<div class="vc-theme vs50">
<div class="vs50-head">{$vs['router_name']}</div>
<div class="vs50-body">
<div class="vs50-label">Kode Voucher</div>
<div class="vs50-code">{$vs['code']}</div>
</div>
<div class="vs50-foot">{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}</div>
<div class="vs50-info">Kuota: {$vs['quota']} · Durasi: {$vs['duration']}</div>
</div>
{else}
<div class="vc-theme vs50">
<div class="vs50-head">{$vs['router_name']}</div>
<div class="vs50-body vs50-pair">
<div><div class="vs50-label">Username</div><div class="vs50-code">{$vs['code']}</div></div>
<div><div class="vs50-label">Password</div><div class="vs50-code">{$vs['secret']}</div></div>
</div>
<div class="vs50-foot">{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}</div>
<div class="vs50-info">Kuota: {$vs['quota']} · Durasi: {$vs['duration']}</div>
</div>
{/if}
{/foreach}
{include file="rad-template-footer.tpl"}`;

// 5 × 10 per A4. Dashed border doubles as the cutting guide.
const COMPACT_50 = `{include file="rad-template-header.tpl"}
<style>
/* WARNA: cukup ubah --vc-warna (dan --vc-teks = warna tulisan di atasnya). */
.vc-theme { --vc-warna: #1d4ed8; --vc-teks: #ffffff; }
.vc50 { display: inline-flex; flex-direction: column; width: 37.5mm; height: 26.5mm; margin: 0.5mm; border: 0.3mm dashed color-mix(in srgb, var(--vc-warna) 55%, #ffffff); border-radius: 1.5mm; background: #fff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; overflow: hidden; vertical-align: top; page-break-inside: avoid; break-inside: avoid; }
.vc50-head { background: var(--vc-warna); color: var(--vc-teks); font-size: 6.5pt; font-weight: bold; padding: 0.7mm 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.vc50-body { padding: 1mm 1.5mm 0; }
.vc50-label { font-size: 5.5pt; color: #475569; letter-spacing: 0.2mm; }
.vc50-code { font-family: 'Courier New', monospace; font-size: 14pt; font-weight: bold; line-height: 1.15; word-break: break-all; }
.vc50-pair { font-family: 'Courier New', monospace; font-size: 10pt; font-weight: bold; line-height: 1.3; word-break: break-all; }
.vc50-pair span { font-family: Arial, Helvetica, sans-serif; font-size: 5.5pt; font-weight: normal; color: #475569; }
.vc50-foot { margin-top: auto; padding: 0 1.5mm; font-size: 7pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vc50-note { padding: 0 1.5mm 0.8mm; font-size: 5.5pt; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
{foreach $v as $vs}
{if $vs['code'] eq $vs['secret']}
<div class="vc-theme vc50">
<div class="vc50-head">{$vs['router_name']}</div>
<div class="vc50-body">
<div class="vc50-label">KODE VOUCHER</div>
<div class="vc50-code">{$vs['code']}</div>
</div>
<div class="vc50-foot">{$vs['validity']} · {$_c['currency_code']} {number_format($vs['total'], 0, ',', '.')}</div>
<div class="vc50-note">Kuota {$vs['quota']}</div>
</div>
{else}
<div class="vc-theme vc50">
<div class="vc50-head">{$vs['router_name']}</div>
<div class="vc50-body">
<div class="vc50-pair"><span>USER </span>{$vs['code']}</div>
<div class="vc50-pair"><span>PASS </span>{$vs['secret']}</div>
</div>
<div class="vc50-foot">{$vs['validity']} · {$_c['currency_code']} {number_format($vs['total'], 0, ',', '.')}</div>
<div class="vc50-note">Kuota {$vs['quota']}</div>
</div>
{/if}
{/foreach}
{include file="rad-template-footer.tpl"}`;

// 5 × 12 per A4, black on white only (no fills) to save ink.
const MINI_60 = `{include file="rad-template-header.tpl"}
<style>
/* WARNA: cukup ubah --vc-warna (dan --vc-teks = warna tulisan di atasnya). */
.vc-theme { --vc-warna: #111111; --vc-teks: #ffffff; }
.vc60 { display: inline-flex; flex-direction: column; width: 37.5mm; height: 22mm; margin: 0.5mm; border: 0.3mm solid var(--vc-warna); border-radius: 1mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; overflow: hidden; vertical-align: top; padding: 1mm 1.5mm; page-break-inside: avoid; break-inside: avoid; }
.vc60-top { display: flex; justify-content: space-between; gap: 1mm; font-size: 6pt; border-bottom: 0.2mm solid var(--vc-warna); padding-bottom: 0.5mm; }
.vc60-top b { color: var(--vc-warna); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vc60-code { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: bold; text-align: center; line-height: 1.2; padding-top: 1.5mm; word-break: break-all; }
.vc60-pair { font-family: 'Courier New', monospace; font-size: 9pt; font-weight: bold; line-height: 1.3; padding-top: 0.8mm; word-break: break-all; }
.vc60-bottom { margin-top: auto; font-size: 7pt; font-weight: bold; text-align: center; }
</style>
{foreach $v as $vs}
{if $vs['code'] eq $vs['secret']}
<div class="vc-theme vc60">
<div class="vc60-top"><b>{$vs['router_name']}</b><span>{$vs['validity']}</span></div>
<div class="vc60-code">{$vs['code']}</div>
<div class="vc60-bottom">{$_c['currency_code']} {number_format($vs['total'], 0, ',', '.')}</div>
</div>
{else}
<div class="vc-theme vc60">
<div class="vc60-top"><b>{$vs['router_name']}</b><span>{$vs['validity']}</span></div>
<div class="vc60-pair">U: {$vs['code']}<br>P: {$vs['secret']}</div>
<div class="vc60-bottom">{$_c['currency_code']} {number_format($vs['total'], 0, ',', '.')}</div>
</div>
{/if}
{/foreach}
{include file="rad-template-footer.tpl"}`;

export const VOUCHER_TEMPLATE_PRESETS: VoucherTemplatePreset[] = [
  {
    key: 'standard-50',
    name: 'Kartu Standar 50 per A4',
    description: 'Desain kartu standar oranye diperkecil jadi 37,5 × 26,5 mm: 5 kolom × 10 baris.',
    perA4: 50,
    htmlTemplate: STANDARD_50,
  },
  {
    key: 'standard',
    name: 'Kartu Standar Besar',
    description: 'Kartu standar ukuran asli dengan kuota dan durasi. 21 voucher per A4 (3 × 7).',
    perA4: 21,
    htmlTemplate: STANDARD,
  },
  {
    key: 'compact-50',
    name: 'Ringkas 50 per A4',
    description: 'Kartu kecil 37,5 × 26,5 mm, 5 kolom × 10 baris, garis potong putus-putus.',
    perA4: 50,
    htmlTemplate: COMPACT_50,
  },
  {
    key: 'mini-60',
    name: 'Mini 60 per A4 (hemat tinta)',
    description: 'Hitam-putih tanpa blok warna, 37,5 × 22 mm, 5 kolom × 12 baris.',
    perA4: 60,
    htmlTemplate: MINI_60,
  },
];
