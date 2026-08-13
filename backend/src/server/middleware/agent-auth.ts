import 'server-only'
import { NextResponse } from 'next/server';
import { verifyAgentToken } from '@/server/auth/agent-jwt';

type AgentAuthorizedResult = {
  authorized: true;
  agentId: string;
  phone: string;
  response?: never;
};

type AgentUnauthorizedResult = {
  authorized: false;
  response: NextResponse;
  agentId?: never;
  phone?: never;
};

export type AgentAuthResult = AgentAuthorizedResult | AgentUnauthorizedResult;

/**
 * Verify the agent Bearer JWT from the Authorization header.
 * Usage:
 *   const auth = await requireAgentAuth(request);
 *   if (!auth.authorized) return auth.response;
 *   const { agentId } = auth;
 */
export async function requireAgentAuth(request: Request): Promise<AgentAuthResult> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Authorization header required' }, { status: 401 }),
    };
  }

  const payload = await verifyAgentToken(token);
  if (!payload) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  return { authorized: true, agentId: payload.agentId, phone: payload.phone };
}
