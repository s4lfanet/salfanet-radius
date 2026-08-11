import { NextRequest } from 'next/server';

// Allow up to 5 minutes for large batch voucher generation (25k vouchers)
export const maxDuration = 300;
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';
import {
  listVouchers,
  generateVouchers,
  deleteVouchers,
  patchVouchers,
} from '@/server/services/hotspot.service';

// GET - List vouchers with filters and pagination
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const data = await listVouchers({
      profileId: searchParams.get('profileId'),
      batchCode: searchParams.get('batchCode'),
      status: searchParams.get('status'),
      routerId: searchParams.get('routerId'),
      agentId: searchParams.get('agentId'),
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '100'),
    });
    return ok(data);
  } catch (error) {
    console.error('Get vouchers error:', error);
    return serverError();
  }
}

// POST - Generate vouchers in batch
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    if (!body.quantity || !body.profileId) {
      return badRequest('Quantity and Profile are required');
    }
    if (body.quantity > 25000) {
      return badRequest('Maximum 25,000 vouchers per request');
    }

    const result = await generateVouchers(body, session);
    return created({
      success: true,
      ...result,
      message: `${result.count} vouchers generated and synced to RADIUS`,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'VALIDATION') return badRequest(err.message!);
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('Generate vouchers error:', error);
    return serverError();
  }
}

// DELETE - Delete voucher or batch
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') ?? undefined;
    const batchCode = searchParams.get('batchCode') ?? undefined;

    if (!id && !batchCode) return badRequest('Voucher ID or Batch Code required');

    const result = await deleteVouchers({ id, batchCode });
    return ok({ message: `${result.count} voucher(s) deleted`, count: result.count });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('Delete voucher error:', error);
    return serverError();
  }
}

// PATCH - Update agent, router, or profile for multiple vouchers
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const { ids, profileId, routerId, agentId, clearAgent, clearRouter } = body as {
      ids: string[];
      profileId?: string;
      routerId?: string | null;
      agentId?: string | null;
      clearAgent?: boolean;
      clearRouter?: boolean;
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return badRequest('ids is required');
    }

    const result = await patchVouchers(ids, { profileId, routerId, agentId, clearAgent, clearRouter }, session);
    return ok(result);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'VALIDATION') return badRequest(err.message!);
    console.error('Patch voucher error:', error);
    return serverError();
  }
}
