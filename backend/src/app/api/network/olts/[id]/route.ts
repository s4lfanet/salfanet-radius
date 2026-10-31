import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { PUT as putByQuery, DELETE as deleteByQuery } from '../route';

/**
 * Path-style aliases for the OLT endpoints. The pages and the unified map
 * call PUT/DELETE /api/network/odps/{id}, while the canonical handlers are
 * query/id-body based — this thin forwarder injects the path id so the
 * existing validation (child-OLT checks, assignments) keeps running.
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

// GET /api/network/olts/:id — single OLT with child counts, for the node
// detail panel (the root GET is list-only).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const olt = await prisma.networkOLT.findUnique({
    where: { id },
    include: {
      odcs: { select: { id: true, name: true } },
      _count: { select: { odcs: true, odps: true, onuStatuses: true } },
    },
  });
  if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

  const { odcs, _count, ...rest } = olt;
  return NextResponse.json({
    success: true,
    olt: {
      ...rest,
      brand: rest.vendor,
      network_odcs: odcs,
      _count: {
        network_odcs: _count.odcs,
        network_odps: _count.odps,
        onu_statuses: _count.onuStatuses,
      },
    },
  });
}
