import { NextRequest, NextResponse } from 'next/server';
import { requireAgentAuth } from '@/server/middleware/agent-auth';
import { revokeAgentSession } from '@/server/auth/agent-jwt';

// POST /api/agent/logout — revoke agent session
// Increments sessionVersion so all existing JWT tokens become invalid
export async function POST(request: NextRequest) {
  const auth = await requireAgentAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await revokeAgentSession(auth.agentId);
    return NextResponse.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    console.error('[agent/logout] error:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
