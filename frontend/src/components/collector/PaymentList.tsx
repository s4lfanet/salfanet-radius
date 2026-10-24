'use client';

import { formatWIB } from '@/lib/timezone';
import { StatusPill, ui, fmtRp, type Tone } from './ui';
import { cn } from '@/lib/utils';

export interface PaymentRow {
  id: string;
  customerName?: string | null;
  customerUsername?: string | null;
  customerId?: string | null;
  profileName?: string | null;
  areaName?: string | null;
  invoiceNumber?: string | null;
  paidAt?: string | null;
  amount: number;
  paymentMethod?: string | null;
}

const METHOD: Record<string, { label: string; tone: Tone }> = {
  cash: { label: 'Tunai', tone: 'slate' },
  transfer: { label: 'Transfer', tone: 'blue' },
  online: { label: 'Transfer', tone: 'blue' },
  discount: { label: 'Diskon', tone: 'amber' },
};
export const paymentMethod = (m?: string | null) => METHOD[m || 'cash'] || { label: m || '-', tone: 'slate' as Tone };

const fmtTime = (d?: string | null) => (d ? formatWIB(d, 'dd MMM yyyy HH:mm') : '-');

/**
 * Payments the collector recorded: a table from md up, where the page is
 * wide enough for one row per payment, and cards on phones.
 */
export function PaymentList({ rows }: { rows: PaymentRow[] }) {
  const showInvoice = rows.some((r) => r.invoiceNumber);
  return (
    <>
      <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
        <table className="w-full text-[13px]">
          <thead className="border-b border-border bg-muted/50 text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Waktu bayar</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Pelanggan</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Paket</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Area</th>
              {showInvoice && <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">No. Invoice</th>}
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Metode</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const m = paymentMethod(r.paymentMethod);
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap tabular-nums">{fmtTime(r.paidAt)}</td>
                  <td className="px-3 py-3 min-w-[12rem]">
                    <p className="font-medium text-foreground">{r.customerName || r.customerUsername || '-'}</p>
                    <p className="text-xs text-muted-foreground">{r.customerId || r.customerUsername}</p>
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell text-foreground">{r.profileName || '-'}</td>
                  <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground">{r.areaName || '-'}</td>
                  {showInvoice && <td className="px-3 py-3 hidden xl:table-cell text-muted-foreground tabular-nums">{r.invoiceNumber || '-'}</td>}
                  <td className="px-3 py-3"><StatusPill tone={m.tone}>{m.label}</StatusPill></td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">{fmtRp(r.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className={cn(ui.card, 'md:hidden divide-y divide-border')}>
        {rows.map((r) => {
          const m = paymentMethod(r.paymentMethod);
          return (
            <li key={r.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{r.customerName || r.customerUsername || '-'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[r.customerId || r.customerUsername, r.profileName, r.areaName].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground">{[r.invoiceNumber && `#${r.invoiceNumber}`, fmtTime(r.paidAt)].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-foreground">{fmtRp(r.amount)}</p>
                <StatusPill tone={m.tone}>{m.label}</StatusPill>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
