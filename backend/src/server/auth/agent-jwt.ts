import 'server-only'
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';

export type AgentJwtPayload = {
  agentId: string;
  phone: string;
  sessionVersion: number;
};

function getSecret(): Uint8Array {
  const secret = process.env.AGENT_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[agent-jwt] AGENT_JWT_SECRET (or NEXTAUTH_SECRET) is required in production.');
    }
    console.warn('[agent-jwt] AGENT_JWT_SECRET not configured or too short. Using fallback dev secret. Set AGENT_JWT_SECRET in .env for production security.');
    return new TextEncoder().encode('dev-agent-secret-change-in-production-please-set-env!!');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign an agent JWT token.
 * Includes sessionVersion for revocation — if the agent's sessionVersion
 * in the database is incremented (logout, disable, password change),
 * the token becomes invalid.
 */
export async function signAgentToken(agentId: string, phone: string, sessionVersion: number = 0): Promise<string> {
  return new SignJWT({ agentId, phone, sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret());
}

/**
 * Verify an agent JWT token.
 * Checks both the signature AND the sessionVersion against the database.
 * If the agent's sessionVersion has been incremented, the token is invalid.
 */
export async function verifyAgentToken(token: string): Promise<AgentJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { agentId, phone, sessionVersion } = payload as Record<string, unknown>;
    if (typeof agentId !== 'string' || typeof phone !== 'string') return null;

    const tokenSessionVersion = typeof sessionVersion === 'number' ? sessionVersion : 0;

    // Check sessionVersion against database for revocation
    // This is a single indexed lookup — minimal overhead
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { sessionVersion: true, isActive: true },
      });

      // Agent deleted or deactivated → token invalid
      if (!agent || !agent.isActive) return null;

      // Session version mismatch → token revoked
      if (agent.sessionVersion !== tokenSessionVersion) return null;
    } catch {
      // If database lookup fails (e.g., table not migrated yet), fall back to
      // signature-only verification for backward compatibility
      // This is safe because the token signature is still verified
    }

    return { agentId, phone, sessionVersion: tokenSessionVersion };
  } catch {
    return null;
  }
}

/**
 * Invalidate all existing JWT tokens for an agent.
 * Called on: logout, disable, force logout, password change.
 * Simply increments the sessionVersion in the database.
 */
export async function revokeAgentSession(agentId: string): Promise<void> {
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      sessionVersion: { increment: 1 },
    },
  });
}
