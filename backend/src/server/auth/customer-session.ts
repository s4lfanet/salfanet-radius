import 'server-only'
import { prisma } from '@/server/db/client';

export async function getCustomerSessionFromRequest(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return null;
  }

  return prisma.customerSession.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
  });
}

export async function getCustomerUserFromRequest(request: Request) {
  const session = await getCustomerSessionFromRequest(request);

  if (!session) {
    return null;
  }

  return prisma.pppoeUser.findUnique({
    where: { id: session.userId },
  });
}