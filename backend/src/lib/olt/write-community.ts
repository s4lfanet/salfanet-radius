/**
 * The SNMP write community lets whoever holds it change the OLT (SNMP SET), so unlike the read
 * community it must never reach the browser.
 *
 * The Prisma client leaves the column out of every query result (server/db/client.ts), including
 * rows pulled in through a relation such as `olt: true`. What the screens need is only whether one
 * is saved, which is answered here by filtering on the column without ever reading it.
 *
 * Code that really needs the value (an SNMP SET) asks for it explicitly:
 *   prisma.networkOLT.findUnique({ where: { id }, omit: { snmpWriteCommunity: false } })
 */
import { prisma } from '@/server/db/client';

/** Ids, among `ids` or of all OLTs, that have a write community saved. */
export async function writeCommunityFlags(ids?: string[]): Promise<Set<string>> {
  const rows = await prisma.networkOLT.findMany({
    where: { snmpWriteCommunity: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

/**
 * What to store for a submitted value. A text sets it, null removes it, and blank or absent keeps
 * what is saved, since a form cannot show the saved value to edit.
 */
export function writeCommunityData(value: unknown): { snmpWriteCommunity?: string | null } {
  if (value === null) return { snmpWriteCommunity: null };
  if (typeof value === 'string' && value.trim()) return { snmpWriteCommunity: value.trim().slice(0, 100) };
  return {};
}
