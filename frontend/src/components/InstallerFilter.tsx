'use client';

import { HardHat } from 'lucide-react';
import { useApiQuery } from '@/lib/api/hooks';
import { INSTALLER_NONE, INSTALLER_UNSET_LABEL, type Installer } from '@/lib/api/installers';

/**
 * Instalatur filter shared by Data Pelanggan, Tagihan, Riwayat Transaksi and
 * Export Data. Value: '' = semua instalatur, 'none' = belum ditentukan, else
 * an installer id. Inactive installers stay in the list: their customers
 * still exist and must stay findable.
 */
export function InstallerFilter({
  value,
  onChange,
  className = '',
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  const { data } = useApiQuery<{ installers: Installer[] }>('/api/pppoe/installers');
  const installers = data?.installers ?? [];

  return (
    <div className={`relative ${className}`}>
      <HardHat className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <select
        id={id}
        aria-label="Filter instalatur"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-3 py-2 bg-input border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/50"
      >
        <option value="">Semua instalatur</option>
        {installers.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}{i.isActive ? '' : ' (nonaktif)'}
          </option>
        ))}
        <option value={INSTALLER_NONE}>{INSTALLER_UNSET_LABEL}</option>
      </select>
    </div>
  );
}

/**
 * Choices for the customer form: active installers, plus the customer's
 * current one even if it was deactivated later (so saving keeps it).
 */
export function useInstallerChoices(currentId?: string | null) {
  const { data } = useApiQuery<{ installers: Installer[] }>('/api/pppoe/installers');
  return (data?.installers ?? []).filter((i) => i.isActive || i.id === currentId);
}

/** <option>s for a form select; first option is "Belum ditentukan" (empty value). */
export function InstallerOptions({ currentId }: { currentId?: string | null }) {
  const choices = useInstallerChoices(currentId);
  return (
    <>
      <option value="">{INSTALLER_UNSET_LABEL}</option>
      {choices.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}{i.isActive ? '' : ' (nonaktif)'}
        </option>
      ))}
    </>
  );
}

/** One row of the server's per-installer summary. installerId null = belum ditentukan. */
export interface InstallerGroup {
  installerId: string | null;
  name: string;
  count: number;
  amount: number;
  /** Riwayat Transaksi only: rows with no customer behind them. */
  notCustomer?: boolean;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

/** Key of a group as a filter value; null for the non-customer group (not filterable). */
export function groupFilterValue(g: InstallerGroup): string | null {
  if (g.notCustomer) return null;
  return g.installerId ?? INSTALLER_NONE;
}

/**
 * Per-installer totals above a grouped list, computed by the server with all
 * active filters. Tapping a row filters to that installer; tapping it again
 * clears the filter.
 */
export function InstallerSummaryBar({
  groups,
  selected,
  onSelect,
  unit,
}: {
  groups: InstallerGroup[];
  selected: string;
  onSelect: (value: string) => void;
  unit: string;
}) {
  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <div className="border-b border-border">
      <div className="px-3 pt-2.5 pb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground">Per instalatur</span>
        <span className="text-[11px] text-muted-foreground">{rupiah(total)}</span>
      </div>
      <ul className="px-1.5 pb-2 flex gap-1.5 overflow-x-auto">
        {groups.map((g) => {
          const value = groupFilterValue(g);
          const active = value !== null && value === selected;
          const share = total > 0 ? Math.round((g.amount / total) * 100) : 0;
          return (
            <li key={`${g.notCustomer ? 'x' : ''}${g.installerId ?? 'none'}`} className="shrink-0">
              <button
                type="button"
                disabled={value === null}
                onClick={() => value !== null && onSelect(active ? '' : value)}
                aria-pressed={active}
                className={`text-left min-w-[9.5rem] px-2.5 py-2 rounded-lg border transition ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/30 hover:bg-muted/60 disabled:hover:bg-muted/30 disabled:cursor-default'
                }`}
              >
                <span className={`block text-xs font-medium truncate max-w-[11rem] ${g.installerId || g.notCustomer ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {g.name}
                </span>
                <span className="block text-[11px] text-foreground tabular-nums">{rupiah(g.amount)}</span>
                <span className="block text-[10px] text-muted-foreground tabular-nums">
                  {g.count} {unit}{share > 0 && !g.notCustomer ? `, ${share}%` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Heading row text for a group inside a grouped list. */
export function groupHeading(groups: InstallerGroup[] | undefined, key: { installerId: string | null; notCustomer?: boolean }) {
  const g = groups?.find((x) => !!x.notCustomer === !!key.notCustomer && x.installerId === key.installerId);
  return {
    name: g?.name ?? (key.notCustomer ? 'Bukan transaksi pelanggan' : INSTALLER_UNSET_LABEL),
    detail: g ? `${g.count} data, ${rupiah(g.amount)}` : '',
  };
}
