import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';

/**
 * Which customers a collector works on: an area, a set of routers/NAS, or
 * both. Both set means customers in that area on one of those routers, so
 * several collectors can split one area by router, or one collector can
 * cover a NAS across areas. A collector with neither sees no one.
 */
export interface CollectorScope {
  areaId: string | null;
  routerIds: string[];
}

export function parseRouterIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

/** The collector's assignment, or null when nothing is assigned yet. */
export async function getCollectorScope(collectorId: string): Promise<CollectorScope | null> {
  const account = await prisma.adminUser.findUnique({
    where: { id: collectorId },
    select: { areaId: true, collectorRouterIds: true },
  });
  if (!account) return null;
  const scope = { areaId: account.areaId, routerIds: parseRouterIds(account.collectorRouterIds) };
  return scope.areaId || scope.routerIds.length ? scope : null;
}

/**
 * Customer filter for a scope. The portal's own Area / Router filter
 * (narrow) can only shrink it: a value outside the scope matches nothing.
 */
export function scopeWhere(scope: CollectorScope, narrow?: { areaId?: string | null; routerId?: string | null }): Prisma.pppoeUserWhereInput {
  const where: Prisma.pppoeUserWhereInput = {};
  if (scope.areaId) where.areaId = scope.areaId;
  if (scope.routerIds.length) where.routerId = { in: scope.routerIds };

  const and: Prisma.pppoeUserWhereInput[] = [where];
  if (narrow?.areaId) and.push({ areaId: narrow.areaId });
  if (narrow?.routerId) and.push({ routerId: narrow.routerId });
  return and.length === 1 ? where : { AND: and };
}

/** Whether one customer falls in the scope (for single-invoice actions). */
export function inScope(scope: CollectorScope | null, customer: { areaId: string | null; routerId: string | null } | null | undefined): boolean {
  if (!scope || !customer) return false;
  if (scope.areaId && customer.areaId !== scope.areaId) return false;
  if (scope.routerIds.length && (!customer.routerId || !scope.routerIds.includes(customer.routerId))) return false;
  return true;
}

/** Areas and routers that occur among the collector's customers, for the portal's filters. */
export async function scopeFilterOptions(scope: CollectorScope) {
  const rows = await prisma.pppoeUser.findMany({
    where: scopeWhere(scope),
    select: { area: { select: { id: true, name: true } }, router: { select: { id: true, name: true } } },
    distinct: ['areaId', 'routerId'],
  });
  const areas = new Map<string, string>();
  const routers = new Map<string, string>();
  for (const r of rows) {
    if (r.area) areas.set(r.area.id, r.area.name);
    if (r.router) routers.set(r.router.id, r.router.name);
  }
  const sorted = (m: Map<string, string>) => [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { areas: sorted(areas), routers: sorted(routers) };
}

/**
 * Router ids from the panel's form, keeping only routers that exist.
 * Returns undefined when the request did not send the field, so an older
 * client (admin app before routers) leaves a collector's routers as they are.
 */
export async function cleanRouterIds(value: unknown): Promise<string[] | undefined> {
  if (value === undefined) return undefined;
  const ids = [...new Set(parseRouterIds(value))];
  if (!ids.length) return [];
  const found = await prisma.router.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const known = new Set(found.map((r) => r.id));
  return ids.filter((id) => known.has(id));
}

export const NO_SCOPE_ERROR = 'Kolektor harus punya area atau minimal satu router/NAS';

/** Text for the panel: "Area Barat · Router A, Router B". */
export async function describeScope(scope: CollectorScope | null): Promise<string> {
  if (!scope) return '';
  const [area, routers] = await Promise.all([
    scope.areaId ? prisma.pppoeArea.findUnique({ where: { id: scope.areaId }, select: { name: true } }) : null,
    scope.routerIds.length ? prisma.router.findMany({ where: { id: { in: scope.routerIds } }, select: { name: true } }) : [],
  ]);
  return [area?.name, routers.map((r) => r.name).join(', ')].filter(Boolean).join(' · ');
}
