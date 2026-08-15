import { NextRequest } from 'next/server';
import { ok, notFound, serverError } from '@/lib/api-response';
import { requirePermission } from '@/server/middleware/api-auth';
import { getPppoeUserById } from '@/server/services/pppoe.service';

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
