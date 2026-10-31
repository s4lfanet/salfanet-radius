import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { PUT as putByQuery, DELETE as deleteByQuery } from '../route';

/**
 * Path-style aliases for the ODC endpoints. The pages and the unified map
 * call PUT/DELETE /api/network/odps/{id}, while the canonical handlers are
 * query/id-body based — this thin forwarder injects the path id so the
 * existing validation (child-ODC checks, assignments) keeps running.
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

// GET /api/network/odcs/:id — single ODC with relations, for the node
// detail panel (the root GET is list-only).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const odc = await prisma.networkODC.findUnique({
    where: { id },
    include: {
      olt: { select: { id: true, name: true, ipAddress: true } },
      otb: { select: { id: true, name: true } },
      odps: { select: { id: true, name: true } },
      _count: { select: { odps: true } },
    },
  });
  if (!odc) return NextResponse.json({ error: 'ODC not found' }, { status: 404 });

  const { olt, otb, odps, _count, ...rest } = odc;
  return NextResponse.json({
    success: true,
    odc: {
      ...rest,
      network_olts: olt,
      network_otbs: otb,
      network_odcs: odps,
      _count: { network_odps: _count.odps },
    },
  });
}
