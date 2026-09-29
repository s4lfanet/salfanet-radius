import { NextRequest } from 'next/server';
import { ok, notFound, serverError, conflict } from '@/lib/api-response';
import { requirePermission } from '@/server/middleware/api-auth';
import { getPppoeUserById, updatePppoeUser } from '@/server/services/pppoe.service';

// GET - Get single user with active session info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const result = await getPppoeUserById(id);
    if (!result) return notFound('User');
    return ok(result);
  } catch (error) {
    console.error('Get user error:', error);
    return serverError();
  }
}

// PUT - Partial update of one user. The web balance page (auto-renewal
// toggle) and network map (customer edit) call this path; it previously had
// no PUT handler, so those saves failed with 405.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const user = await updatePppoeUser({ ...body, id }, authCheck.session, request);
    return ok({ success: true, user });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    if (err.code === 'DUPLICATE_USERNAME') return conflict(err.message!);
    console.error('Update PPPoE user error:', error);
    return serverError();
  }
}
