import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { PUT as putByQuery, DELETE as deleteByQuery } from '../route';

/**
 * Path-style aliases for the ODP endpoints. The pages and the unified map
 * call PUT/DELETE /api/network/odps/{id}, while the canonical handlers are
 * query/id-body based — this thin forwarder injects the path id so the
 * existing validation (child-ODP checks, assignments) keeps running.
 */
async function forward(req: NextRequest, id: string, method: 'PUT' | 'DELETE') {
  let body: Record<string, unknown> = {};
  if (method === 'PUT') {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const url = new URL(req.url);
  url.searchParams.set('id', id);
  const forwarded = new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie')! } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify({ ...body, id }) } : {}),
  });
  return method === 'PUT' ? putByQuery(forwarded) : deleteByQuery(forwarded);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(req, id, 'PUT');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(req, id, 'DELETE');
}

// GET /api/network/odps/:id — single ODP with relations, for the node
// detail panel (the map calls the path-style route; the root GET is
// list-only so this resolves the record directly).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const odp = await prisma.networkODP.findUnique({
    where: { id },
    include: {
      olt: { select: { id: true, name: true, ipAddress: true } },
      odc: { select: { id: true, name: true } },
      parentOdp: { select: { id: true, name: true } },
      _count: { select: { customers: true, childOdps: true } },
    },
  });
  if (!odp) return NextResponse.json({ error: 'ODP not found' }, { status: 404 });

  const { olt, odc, parentOdp, _count, ...rest } = odp;
  return NextResponse.json({
    success: true,
    odp: {
      ...rest,
      network_olts: olt,
      network_odcs: odc,
      parent_odp: parentOdp,
      _count: {
        odp_customer_assignments: _count.customers,
        child_odps: _count.childOdps,
      },
    },
  });
}
