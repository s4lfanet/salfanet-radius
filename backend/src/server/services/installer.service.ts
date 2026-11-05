/**
 * Instalatur (installer) helpers shared by the customer, invoice,
 * transaction and export endpoints, so every page filters the same way.
 *
 * Filter values (query param `installerId`):
 *   ''  / 'all'  → all installers (no filter)
 *   'none'       → customers without an installer ("Belum ditentukan")
 *   <id>         → one installer
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';

export const INSTALLER_NONE = 'none';
export const INSTALLER_UNSET_LABEL = 'Belum ditentukan';
/** Transactions with no customer behind them (expenses, manual entries). */
export const NOT_CUSTOMER_LABEL = 'Bukan transaksi pelanggan';

export type InstallerFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'one'; id: string };

export function parseInstallerFilter(value: string | null | undefined): InstallerFilter {
  const v = (value ?? '').trim();
  if (!v || v === 'all') return { kind: 'all' };
  if (v === INSTALLER_NONE) return { kind: 'none' };
  return { kind: 'one', id: v };
}

/** `where` fragment for pppoeUser. */
export function installerUserWhere(f: InstallerFilter): Prisma.pppoeUserWhereInput {
  if (f.kind === 'none') return { installerId: null };
  if (f.kind === 'one') return { installerId: f.id };
  return {};
}

/**
 * `where` fragment for invoice. Invoices without a customer (hotspot,
 * deleted customer) have no installer and count as "Belum ditentukan".
 */
export function installerInvoiceWhere(f: InstallerFilter): Prisma.invoiceWhereInput {
  if (f.kind === 'none') return { OR: [{ userId: null }, { user: { is: { installerId: null } } }] };
  if (f.kind === 'one') return { user: { is: { installerId: f.id } } };
  return {};
}

export function installerLabel(installer: { name: string } | null | undefined): string {
  return installer?.name ?? INSTALLER_UNSET_LABEL;
}

/**
 * Installer for a customer a technician registers (PSB): the installer made
 * from that technician, created on first use. Null when the technician no
 * longer exists.
 */
export async function installerIdForTechnician(technicianId: string | null | undefined): Promise<string | null> {
  if (!technicianId) return null;
  const linked = await prisma.installer.findUnique({ where: { technicianId }, select: { id: true } });
  if (linked) return linked.id;

  const tech = await prisma.technician.findUnique({ where: { id: technicianId }, select: { name: true } });
  if (!tech) return null;

  // Same name already in the list (made by hand): link it instead of
  // creating "Budi (2)".
  const sameName = await prisma.installer.findUnique({ where: { name: tech.name.trim() }, select: { id: true, technicianId: true } });
  if (sameName) {
    if (!sameName.technicianId) {
      await prisma.installer.update({ where: { id: sameName.id }, data: { technicianId } });
    }
    return sameName.id;
  }

  const created = await prisma.installer.create({
    data: { name: tech.name.trim().slice(0, 100), technicianId },
    select: { id: true },
  });
  return created.id;
}

/** Active installer by id, or an error message for the API. */
export async function validateInstallerId(id: string | null | undefined, currentId?: string | null): Promise<string | null> {
  if (!id) return null;
  const inst = await prisma.installer.findUnique({ where: { id }, select: { isActive: true } });
  if (!inst) return 'Instalatur tidak ditemukan';
  // Keeping an installer that was deactivated later is fine; picking one is not.
  if (!inst.isActive && id !== currentId) return 'Instalatur sudah nonaktif, pilih instalatur lain';
  return null;
}

export interface InstallerGroup {
  /** null = "Belum ditentukan" */
  installerId: string | null;
  name: string;
  count: number;
  amount: number;
  /** Riwayat Transaksi only: rows with no customer behind them. */
  notCustomer?: boolean;
}

/**
 * Unassigned first, then by name — the order MySQL gives the grouped list
 * (NULL sorts first ascending), so summary and list read the same way.
 */
export function sortGroups(groups: InstallerGroup[]): InstallerGroup[] {
  return groups.sort((a, b) => {
    if (a.installerId === null) return -1;
    if (b.installerId === null) return 1;
    return a.name.localeCompare(b.name, 'id');
  });
}

/**
 * Count and total of invoices per installer for the same `where` the list
 * uses, so the summary always matches the filtered list. Prisma cannot group
 * by a relation's field, so group by customer first and fold into installers.
 */
export async function summarizeInvoicesByInstaller(where: Prisma.invoiceWhereInput): Promise<InstallerGroup[]> {
  const byUser = await prisma.invoice.groupBy({
    by: ['userId'],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });
  return foldByInstaller(byUser.map((r) => ({ userId: r.userId, count: r._count._all, amount: r._sum.amount ?? 0 })));
}

/** Fold per-customer counts into per-installer groups. */
export async function foldByInstaller(rows: { userId: string | null; count: number; amount: number }[]): Promise<InstallerGroup[]> {
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const installerOf = new Map<string, string | null>();
  for (let i = 0; i < userIds.length; i += 1000) {
    const chunk = await prisma.pppoeUser.findMany({
      where: { id: { in: userIds.slice(i, i + 1000) } },
      select: { id: true, installerId: true },
    });
    chunk.forEach((u) => installerOf.set(u.id, u.installerId));
  }

  const installerIds = [...new Set([...installerOf.values()].filter((id): id is string => !!id))];
  const installers = installerIds.length
    ? await prisma.installer.findMany({ where: { id: { in: installerIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(installers.map((i) => [i.id, i.name]));

  const groups = new Map<string | null, InstallerGroup>();
  for (const r of rows) {
    const installerId = (r.userId && installerOf.get(r.userId)) || null;
    const g = groups.get(installerId) ?? {
      installerId,
      name: installerId ? nameOf.get(installerId) ?? INSTALLER_UNSET_LABEL : INSTALLER_UNSET_LABEL,
      count: 0,
      amount: 0,
    };
    g.count += r.count;
    g.amount += r.amount;
    groups.set(installerId, g);
  }
  return sortGroups([...groups.values()]);
}

/** `where` fragment for transactions (via the linked customer). */
export function installerTransactionWhere(f: InstallerFilter): Prisma.transactionWhereInput {
  if (f.kind === 'none') return { pppoeUserId: { not: null }, pppoeUser: { is: { installerId: null } } };
  if (f.kind === 'one') return { pppoeUser: { is: { installerId: f.id } } };
  return {};
}

/** Rows of one summary group, for paging across groups. */
export function transactionGroupWhere(g: InstallerGroup): Prisma.transactionWhereInput {
  if (g.notCustomer) return { pppoeUserId: null };
  if (g.installerId === null) return { pppoeUserId: { not: null }, pppoeUser: { is: { installerId: null } } };
  return { pppoeUser: { is: { installerId: g.installerId } } };
}

/**
 * Riwayat Transaksi per installer: net amount (income − expense) and count,
 * with the same `where` as the list. Rows without a customer form their own
 * group ("Bukan transaksi pelanggan"), placed last.
 */
export async function summarizeTransactionsByInstaller(where: Prisma.transactionWhereInput): Promise<InstallerGroup[]> {
  const rows = await prisma.transaction.groupBy({
    by: ['pppoeUserId', 'type'],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });

  const customer = new Map<string, { count: number; amount: number }>();
  const other = { count: 0, amount: 0 };
  for (const r of rows) {
    const signed = (r._sum.amount ?? 0) * (r.type === 'EXPENSE' ? -1 : 1);
    if (!r.pppoeUserId) {
      other.count += r._count._all;
      other.amount += signed;
      continue;
    }
    const c = customer.get(r.pppoeUserId) ?? { count: 0, amount: 0 };
    c.count += r._count._all;
    c.amount += signed;
    customer.set(r.pppoeUserId, c);
  }

  const groups = await foldByInstaller([...customer.entries()].map(([userId, c]) => ({ userId, ...c })));
  if (other.count > 0) {
    groups.push({ installerId: null, name: NOT_CUSTOMER_LABEL, count: other.count, amount: other.amount, notCustomer: true });
  }
  return groups;
}

/**
 * One page of a list ordered group by group (in `groups` order), newest
 * first inside a group. `fetch` loads `take` rows of a group from `skip`.
 */
export async function pageAcrossGroups<T>(
  groups: InstallerGroup[],
  skip: number,
  take: number,
  fetch: (g: InstallerGroup, skip: number, take: number) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (const g of groups) {
    const start = offset;
    const end = offset + g.count;
    offset = end;
    if (end <= skip) continue;
    if (out.length >= take) break;
    const localSkip = Math.max(0, skip - start);
    const localTake = Math.min(g.count - localSkip, take - out.length);
    if (localTake > 0) out.push(...(await fetch(g, localSkip, localTake)));
  }
  return out;
}
