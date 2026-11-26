export interface PrintableVoucher {
  code: string;
  profileName: string;
  sellingPrice?: number;
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Prints vouchers on a thermal roll (58mm or 80mm), one ticket per voucher.
 * Opens the browser print dialog; pick the thermal printer there.
 * Returns false when the browser blocked the print window.
 */
export function printVouchersThermal(
  vouchers: PrintableVoucher[],
  opts: { title?: string; agentName?: string; width?: '58mm' | '80mm' } = {},
): boolean {
  if (vouchers.length === 0) return false;
  const width = opts.width ?? '58mm';
  const title = opts.title ?? 'VOUCHER INTERNET';
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return false;

  const tickets = vouchers
    .map((v) => {
      const price = typeof v.sellingPrice === 'number' && v.sellingPrice > 0 ? `Rp ${v.sellingPrice.toLocaleString('id-ID')}` : '';
      return `<section class="ticket">
  <div class="title">${esc(title)}</div>
  ${opts.agentName ? `<div class="small">${esc(opts.agentName)}</div>` : ''}
  <div class="line"></div>
  <div class="label">Kode Voucher</div>
  <div class="code">${esc(v.code)}</div>
  <div class="line"></div>
  <div class="row"><span>Paket</span><b>${esc(v.profileName)}</b></div>
  ${price ? `<div class="row"><span>Harga</span><b>${esc(price)}</b></div>` : ''}
  <div class="small foot">Masukkan kode sebagai username &amp; password</div>
</section>`;
    })
    .join('\n');

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: ${width}; font-family: 'Courier New', monospace; color: #000; }
  .ticket { padding: 3mm 3mm 5mm; page-break-after: always; break-after: page; text-align: center; }
  .title { font-weight: bold; font-size: 13px; }
  .small { font-size: 10px; }
  .label { font-size: 10px; margin-top: 2mm; }
  .code { font-size: 20px; font-weight: bold; letter-spacing: 1px; word-break: break-all; margin: 1mm 0 2mm; }
  .line { border-top: 1px dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; text-align: left; }
  .foot { margin-top: 3mm; }
</style></head><body>${tickets}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
</body></html>`);
  win.document.close();
  return true;
}
