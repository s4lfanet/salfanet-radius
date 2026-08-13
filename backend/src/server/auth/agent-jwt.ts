import 'server-only'
import { SignJWT, jwtVerify } from 'jose';

export type AgentJwtPayload = {
  agentId: string;
  phone: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.AGENT_JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Log warning but do not crash — fallback is used until admin sets the secret.
    // All tokens signed with the fallback become invalid when AGENT_JWT_SECRET is set.
    console.warn('[agent-jwt] AGENT_JWT_SECRET not configured or too short. Using fallback dev secret. Set AGENT_JWT_SECRET in .env for production security.');
    return new TextEncoder().encode('dev-agent-secret-change-in-production-please-set-env!!');
  }
  return new TextEncoder().encode(secret);
}

export async function signAgentToken(agentId: string, phone: string): Promise<string> {
  return new SignJWT({ agentId, phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyAgentToken(token: string): Promise<AgentJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { agentId, phone } = payload as Record<string, unknown>;
    if (typeof agentId !== 'string' || typeof phone !== 'string') return null;
    return { agentId, phone };
  } catch {
    return null;
  }
}
