import { NextRequest } from 'next/server';
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
