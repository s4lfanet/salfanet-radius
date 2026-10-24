/** wa.me wants the number with country code and no symbols. */
export const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
};

/** Chat link with the message already typed in, ready to review and send. */
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

const rp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

/**
 * The collector's message to a customer: a payment reminder when invoices
 * are open, otherwise a plain greeting the collector can continue.
 */
export function collectorWaText(c: {
  name: string | null;
  username: string;
  customerId?: string | null;
  unpaid_count: number;
  unpaid_amount: number;
  profile?: { name: string } | null;
}, company?: string) {
  const who = c.name || c.username;
  const from = company ? ` dari ${company}` : '';
  if (c.unpaid_count > 0) {
    const id = c.customerId || c.username;
    const pkg = c.profile?.name ? `, paket ${c.profile.name}` : '';
    const bills = c.unpaid_count > 1 ? ` (${c.unpaid_count} tagihan)` : '';
    return [
      `Halo Bapak/Ibu ${who},`,
      '',
      `Kami${from} ingin mengingatkan tagihan internet Anda (ID pelanggan ${id}${pkg}) sebesar ${rp(c.unpaid_amount)}${bills} belum dibayar.`,
      '',
      'Pembayaran bisa melalui kolektor kami atau transfer. Jika sudah membayar, mohon abaikan pesan ini.',
      '',
      'Terima kasih.',
    ].join('\n');
  }
  return company ? `Halo Bapak/Ibu ${who}, kami dari ${company}.\n\n` : `Halo Bapak/Ibu ${who},\n\n`;
}
