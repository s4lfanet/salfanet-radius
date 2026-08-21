import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

export interface CollectorPayload {
  id: string;
  username: string;
  name: string;
  phone?: string;
  role: string;
  type: string;
}

export async function verifyCollector(req: NextRequest): Promise<CollectorPayload | null> {
  const token = req.cookies.get('collector-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
    if (payload.type !== 'admin_user' || payload.role !== 'collector') return null;
    return payload as unknown as CollectorPayload;
  } catch {
    return null;
  }
}
