type ToastError = (type: 'error', title: string, description?: string) => void;

interface InvoicePrintData {
  company: {
    name: string;
    logo?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    poweredBy?: string | null;
    bankAccounts?: Array<{
      bankName: string;
      accountNumber: string;
      accountName: string;
    }>;
  };
  customer: {
    name: string;
    customerId?: string | null;
    phone?: string | null;
    username?: string | null;
    area?: string | null;
  };
  invoice: {
    number: string;
    date: string;
    dueDate: string;
    paidAt?: string | null;
    status: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  additionalFees?: Array<{
    name: string;
    amount: number;
  }>;
  tax?: {
    hasTax: boolean;
    taxRate: number;
    baseAmount: number;
    taxAmount: number;
  } | null;
  amountFormatted: string;
  paymentLink?: string | null;
}

async function loadInvoicePrintData(invoiceId: string, toast: ToastError, token?: string | null): Promise<InvoicePrintData | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { headers });
    const data = await res.json();

    if (!data.success || !data.data) {
      toast('error', 'Gagal', 'Gagal mengambil data tagihan');
      return null;
    }

    return data.data as InvoicePrintData;
  } catch {
    toast('error', 'Gagal', 'Gagal mengambil data tagihan');
    return null;
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}

export async function printInvoiceStandard(invoiceId: string, toast: ToastError, token?: string | null) {
  const inv = await loadInvoicePrintData(invoiceId, toast, token);
  if (!inv) return;

  const win = window.open('', '_blank', 'width=850,height=1100');
  if (!win) {
    toast('error', 'Gagal', 'Popup print diblokir browser');
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Invoice ${inv.invoice.number}</title>
      <style>
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .topbar { display: none !important; }
          .sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; max-width: 100% !important; width: 100% !important; margin: 0 !important; }
          .content { padding: 6mm 8mm !important; }
          .header-right { padding-top: 0 !important; overflow: visible !important; }
          .inv-title { overflow: visible !important; padding-top: 0 !important; line-height: 1.3 !important; }
          .inv-number { overflow: visible !important; line-height: 1.4 !important; }
          .meta-card, .payment-card, .paid-stamp { break-inside: avoid; page-break-inside: avoid; }
          table { table-layout: fixed; }
          th, td { word-break: break-word; }
        }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 24px 24px 80px; background: #f8fafc; }
        .sheet { background: #fff; border: 1px solid #dbe7e4; border-radius: 18px; overflow: visible; box-shadow: 0 18px 50px rgba(15, 118, 110, 0.08); max-width: 980px; margin: 0 auto; }
        .topbar { height: 7px; background: linear-gradient(90deg, #0d9488, #14b8a6, #5eead4); }
        .content { padding: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 20px; }
        .brand-wrap { display:flex; align-items:center; gap:14px; }
        .header-right { text-align:right; padding-top: 2px; }
        .logo-box { width: 78px; height: 78px; border-radius: 16px; background: linear-gradient(180deg, #ecfeff, #f0fdfa); border: 1px solid #c7f9f1; display:flex; align-items:center; justify-content:center; padding: 10px; }
        .company-name { font-size: 20px; font-weight: bold; color: #0d9488; }
        .company-sub { color: #555; margin-top: 3px; font-size: 10px; line-height: 1.6; }
        .inv-title { font-size: 26px; font-weight: bold; color: #111; letter-spacing: 2px; line-height: 1.25; padding-top: 1px; }
        .inv-number { font-size: 13px; font-weight: bold; color: #0d9488; margin: 4px 0; line-height: 1.35; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .paid-badge { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
        .pending-badge { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .divider { border: none; border-top: 2px solid #0d9488; margin: 14px 0; }
        .section-title { font-weight: bold; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
        .meta-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
        .info-row { margin-bottom: 3px; }
        .info-label { color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #0d9488; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .td-right { text-align: right; }
        .total-row td { font-weight: bold; font-size: 13px; background: #f0fdfa; border-top: 2px solid #0d9488; }
        .actions-grid { display:grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin: 18px 0 6px; }
        .payment-card { padding: 16px; border-radius: 14px; border: 1px solid #99f6e4; background: linear-gradient(180deg, #f0fdfa, #ffffff); }
        .payment-card-title { font-size: 13px; font-weight: 700; color: #0f766e; margin-bottom: 6px; }
        .payment-cta { display:inline-block; margin-top: 10px; padding: 8px 14px; border-radius: 999px; background: #0d9488; color: #fff; text-decoration: none; font-size: 11px; font-weight: 700; }
        .payment-link { display:block; margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #0f172a; color: #fff; text-decoration: none; font-size: 11px; line-height: 1.5; word-break: break-all; }
        .payment-note { margin: 0; color: #475569; font-size: 11px; line-height: 1.6; }
        .paid-stamp { display: block; margin: 20px auto; padding: 12px 28px; border: 4px solid #10b981; border-radius: 10px; text-align: center; width: fit-content; }
        .paid-stamp-text { font-size: 24px; font-weight: bold; color: #10b981; letter-spacing: 6px; }
        .paid-stamp-sub { font-size: 11px; color: #555; margin-top: 2px; }
        .footer { margin-top: 28px; text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 10px; padding: 12px 16px; background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
        .btn-print { flex: 1; padding: 12px; background: #0d9488; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-close { flex: 1; padding: 12px; background: #6b7280; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        @media (max-width: 640px) {
          body { padding: 8px 8px 80px !important; }
          .sheet { border-radius: 10px !important; max-width: 100% !important; }
          .content { padding: 14px !important; }
          .header { flex-direction: column; gap: 10px; }
          .header-right { text-align: left; padding-top: 0; }
          .inv-title { font-size: 20px; }
          .inv-number { font-size: 12px; }
          .bill-grid { grid-template-columns: 1fr; gap: 12px; }
          .meta-card { padding: 10px 12px; }
          .actions-grid { grid-template-columns: 1fr; }
          table { font-size: 10px; }
          th, td { padding: 5px 6px; }
          .paid-stamp-text { font-size: 18px; }
        }
      </style></head><body>
      <div class="sheet">
      <div class="topbar"></div>
      <div class="content">
      <div class="header">
        <div class="brand-wrap">
          ${inv.company.logo ? `<div class="logo-box"><img src="${inv.company.logo}" style="max-height:58px;max-width:58px;width:auto;object-fit:contain" alt="Logo"></div>` : ''}
          <div>
            <div class="company-name">${inv.company.name}</div>
            <div class="company-sub">
              ${inv.company.address ? `${inv.company.address}<br>` : ''}
              ${inv.company.phone ? `Telp: ${inv.company.phone}<br>` : ''}
              ${inv.company.email ? `${inv.company.email}` : ''}
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="inv-title">INVOICE</div>
          <div class="inv-number">${inv.invoice.number}</div>
          <div>${inv.invoice.status === 'PAID' ? '<span class="status-badge paid-badge">&#10003; SUDAH BAYAR</span>' : '<span class="status-badge pending-badge">BELUM BAYAR</span>'}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Dari</div>
          <div class="info-row"><strong>${inv.company.name}</strong></div>
          ${inv.company.address ? `<div class="info-row">${inv.company.address}</div>` : ''}
          ${inv.company.phone ? `<div class="info-row">Telp: ${inv.company.phone}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Kepada</div>
          <div class="info-row"><strong>${inv.customer.name}</strong></div>
          ${inv.customer.customerId ? `<div class="info-row"><span class="info-label">ID Pelanggan: </span>${inv.customer.customerId}</div>` : ''}
          ${inv.customer.phone ? `<div class="info-row"><span class="info-label">Telp: </span>${inv.customer.phone}</div>` : ''}
          ${inv.customer.username ? `<div class="info-row"><span class="info-label">Username: </span>${inv.customer.username}</div>` : ''}
          ${inv.customer.area ? `<div class="info-row"><span class="info-label">Area: </span>${inv.customer.area}</div>` : ''}
        </div>
      </div>
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Detail Invoice</div>
          <div class="info-row"><span class="info-label">No Invoice: </span><strong>${inv.invoice.number}</strong></div>
          <div class="info-row"><span class="info-label">Tanggal: </span>${inv.invoice.date}</div>
          <div class="info-row"><span class="info-label">Jatuh Tempo: </span>${inv.invoice.dueDate}</div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Tgl Bayar: </span>${inv.invoice.paidAt}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Status Pembayaran</div>
          <div class="info-row"><span class="info-label">Status: </span><strong>${inv.invoice.status === 'PAID' ? '&#10003; LUNAS' : inv.invoice.status === 'OVERDUE' ? '&#9888; TERLAMBAT' : '&#9203; BELUM BAYAR'}</strong></div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Dibayar pada: </span>${inv.invoice.paidAt}</div><div class="info-row"><span class="info-label">Via: </span>${inv.paymentLink ? 'Payment Gateway' : 'Manual'}</div>` : ''}
        </div>
      </div>
      <div class="section-title">Rincian Layanan</div>
      <table>
        <thead><tr><th>Deskripsi</th><th style="width:60px;text-align:center">Qty</th><th style="width:130px;text-align:right">Harga</th><th style="width:130px;text-align:right">Total</th></tr></thead>
        <tbody>
          ${inv.items.map((item) => `
            <tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td class="td-right">${formatCurrency(item.price)}</td><td class="td-right">${formatCurrency(item.total)}</td></tr>
          `).join('')}
          ${(inv.additionalFees || []).map((fee) => `
            <tr><td>${fee.name}</td><td style="text-align:center">1</td><td class="td-right">${formatCurrency(fee.amount)}</td><td class="td-right">${formatCurrency(fee.amount)}</td></tr>
          `).join('')}
          ${inv.tax && inv.tax.hasTax ? `
            <tr style="background:#f9fafb"><td colspan="3" style="text-align:right;font-size:11px;color:#555;padding:5px 10px">Subtotal</td><td class="td-right" style="color:#555;font-size:11px;padding:5px 10px">${formatCurrency(inv.tax.baseAmount)}</td></tr>
            <tr style="background:#fffbeb"><td colspan="3" style="text-align:right;font-size:11px;color:#d97706;padding:5px 10px">PPN ${inv.tax.taxRate}%</td><td class="td-right" style="color:#d97706;font-size:11px;padding:5px 10px">${formatCurrency(inv.tax.taxAmount)}</td></tr>
          ` : ''}
          <tr class="total-row"><td colspan="3" class="td-right">TOTAL</td><td class="td-right">${inv.amountFormatted}</td></tr>
        </tbody>
      </table>
      ${!inv.invoice.paidAt && inv.paymentLink ? `
        <div class="actions-grid">
          <div class="payment-card">
            <div class="payment-card-title">Link Pembayaran Online</div>
            <p class="payment-note">Pelanggan dapat membuka link berikut untuk melakukan pembayaran langsung.</p>
            <a class="payment-cta" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">Buka Halaman Bayar</a>
            <a class="payment-link" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">${inv.paymentLink}</a>
          </div>
          <div class="payment-card">
            <div class="payment-card-title">Petunjuk Pembayaran</div>
            <p class="payment-note">Arahkan pelanggan untuk menggunakan link pembayaran online di samping atau transfer manual.</p>
          </div>
        </div>
      ` : ''}
      ${inv.invoice.paidAt ? `<div class="paid-stamp"><div class="paid-stamp-text">LUNAS</div><div class="paid-stamp-sub">Dibayar pada ${inv.invoice.paidAt}</div></div>` :
        (inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `
        <div style="margin:18px 0;padding:16px;border:1px solid #6ee7b7;border-radius:8px;background:#f0fdfa">
          <div class="section-title" style="margin-bottom:10px">Pembayaran Manual</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${inv.company.bankAccounts.map((ba) => `
              <div style="border:1px solid #0d948840;border-radius:8px;padding:10px 14px;background:#fff">
                <div style="font-weight:bold;font-size:12px;color:#0d9488;margin-bottom:4px">${ba.bankName}</div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">${ba.accountNumber}</div>
                <div style="font-size:11px;color:#555;margin-top:2px">a/n ${ba.accountName}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '')}
      <div class="footer">Terima kasih atas kepercayaan Anda &mdash; ${inv.company.name}${inv.company.poweredBy ? `<br><span style="font-size:9px">Support by ${inv.company.poweredBy}</span>` : ''}</div>
      </div>
      </div>
      <div class="action-bar no-print">
        <button class="btn-print" onclick="window.print()">&#128438; Cetak</button>
        <button class="btn-close" onclick="window.close()">&#10005; Tutup</button>
      </div>
      </body></html>`);
  win.document.close();
}

export async function printInvoiceThermal(invoiceId: string, toast: ToastError, token?: string | null) {
  const inv = await loadInvoicePrintData(invoiceId, toast, token);
  if (!inv) return;

  const win = window.open('', '_blank', 'width=400,height=650');
  if (!win) {
    toast('error', 'Gagal', 'Popup print diblokir browser');
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Struk ${inv.invoice.number}</title>
      <style>
        @media print { @page { margin: 0; width: 80mm; } body { padding: 0 !important; } .no-print { display: none !important; } }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 80mm; max-width: 100%; padding: 0 0 70px; margin: 0 auto; color: #000; background: #fff; }
        .receipt { border-top: 4px solid #0d9488; padding: 5mm 4mm; }
        .logo { display:block; max-width: 34mm; max-height: 14mm; margin: 0 auto 3px; object-fit: contain; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 14px; }
        .dashed { border-top: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .row span:first-child { color: #444; flex-shrink: 0; margin-right: 8px; }
        .row span:last-child { text-align: right; }
        .total-row { font-weight: bold; font-size: 13px; }
        .lunas-stamp { display: block; text-align: center; font-size: 17px; font-weight: bold; border: 3px double #000; padding: 4px 14px; margin: 8px auto; width: fit-content; letter-spacing: 3px; }
        .sm { font-size: 10px; color: #555; }
        .bank-box { border: 1px dashed #000; padding: 5px; margin: 4px 0; }
        .pay-box { border: 1px solid #0d9488; background: #f0fdfa; padding: 6px; margin: 6px 0; }
        .pay-link { display:block; color:#0f172a; text-decoration:none; word-break:break-all; margin-top:4px; }
        .action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; padding: 10px 12px; background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
        .btn-print { flex: 1; padding: 10px; background: #0d9488; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-close { flex: 1; padding: 10px; background: #6b7280; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
      </style></head><body>
      <div class="receipt">
      ${inv.company.logo ? `<img class="logo" src="${inv.company.logo}" alt="Logo">` : ''}
      <div class="center bold big">${inv.company.name}</div>
      ${inv.company.address ? `<div class="center sm">${inv.company.address}</div>` : ''}
      ${inv.company.phone ? `<div class="center sm">Telp: ${inv.company.phone}</div>` : ''}
      <div class="dashed"></div>
      <div class="row"><span>No</span><span>${inv.invoice.number}</span></div>
      <div class="row"><span>Tgl</span><span>${inv.invoice.date}</span></div>
      <div class="row"><span>Kasir</span><span>Pelanggan</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Pelanggan</span><span>${inv.customer.name}</span></div>
      ${inv.customer.customerId ? `<div class="row"><span>ID</span><span>${inv.customer.customerId}</span></div>` : ''}
      ${inv.customer.phone ? `<div class="row"><span>Telp</span><span>${inv.customer.phone}</span></div>` : ''}
      ${inv.customer.area ? `<div class="row"><span>Area</span><span>${inv.customer.area}</span></div>` : ''}
      <div class="dashed"></div>
      ${inv.items.map((item) => `
        <div style="margin-bottom:3px">${item.description}</div>
        <div class="row"><span>&nbsp;&nbsp;${item.quantity} x</span><span>${formatCurrency(item.price)}</span></div>
      `).join('')}
      ${(inv.additionalFees || []).map((fee) => `
        <div style="margin-bottom:3px">${fee.name}</div>
        <div class="row"><span>&nbsp;&nbsp;1 x</span><span>${formatCurrency(fee.amount)}</span></div>
      `).join('')}
      <div class="dashed"></div>
      ${inv.tax && inv.tax.hasTax ? `<div class="row"><span>Subtotal</span><span>${formatCurrency(inv.tax.baseAmount)}</span></div><div class="row"><span>PPN ${inv.tax.taxRate}%</span><span>${formatCurrency(inv.tax.taxAmount)}</span></div><div class="dashed"></div>` : ''}
      <div class="row total-row"><span>TOTAL</span><span>${inv.amountFormatted}</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Jatuh Tempo</span><span>${inv.invoice.dueDate}</span></div>
      ${inv.invoice.paidAt ? `
        <div class="dashed"></div>
        <div class="row"><span>Tgl Bayar</span><span>${inv.invoice.paidAt}</span></div>
        <div class="row"><span>Metode</span><span>${inv.paymentLink ? 'Gateway' : 'Manual'}</span></div>
        <div class="lunas-stamp">** LUNAS **</div>
      ` : `${inv.paymentLink ? `<div class="pay-box"><div class="center bold">Link Pembayaran</div><a class="pay-link" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">${inv.paymentLink}</a></div>` : ''}${inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `<div style="margin:6px 0"><div class="center bold">Transfer Manual</div>${inv.company.bankAccounts.map((ba) => `<div class="bank-box"><div class="bold">${ba.bankName}</div><div>${ba.accountNumber}</div><div class="sm">a/n ${ba.accountName}</div></div>`).join('')}</div>` : `<div class="center sm" style="margin:6px 0">Harap bayar sebelum jatuh tempo</div>`}`}
      <div class="dashed"></div>
      <div class="center sm" style="margin-top:4px">Terima kasih</div>
      ${inv.company.poweredBy ? `<div class="center sm" style="margin-top:2px">Support by ${inv.company.poweredBy}</div>` : ''}
      </div>
      <div class="action-bar no-print">
        <button class="btn-print" onclick="window.print()">&#128438; Cetak</button>
        <button class="btn-close" onclick="window.close()">&#10005; Tutup</button>
      </div>
      </body></html>`);
  win.document.close();
}