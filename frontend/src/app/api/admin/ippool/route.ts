import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Proxy route for /api/admin/ippool (base path)
// Forwards to NestJS backend /api/v1/ippool with NextAuth cookie

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function proxyToBackend(request: NextRequest, backendPath: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const url = new URL(request.url);
  const targetUrl = `${BACKEND_URL}${backendPath}${url.search}`;

  const method = request.method;
  const headers: Record<string, string> = { Cookie: cookieHeader };

  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    body = await request.text();
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(targetUrl, { method, headers, body });
  const data = await res.text();
  return new NextResponse(data, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/api/v1/ippool');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/api/v1/ippool');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/api/v1/ippool/expand');
}

export async function DELETE(request: NextRequest) {
  return proxyToBackend(request, '/api/v1/ippool');
}
