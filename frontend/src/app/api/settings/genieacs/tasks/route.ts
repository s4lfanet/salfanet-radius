import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { getGenieACSCredentials } from '../route';

// Helper: fetch with AbortController timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// POST - Queue task to GenieACS for a device
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { error: 'GenieACS not configured' },
        { status: 400 }
      );
    }

    const { host, username, password } = credentials;
    const body = await request.json();
    const { deviceId, taskName } = body as { deviceId: string; taskName: string };

    if (!deviceId || !taskName) {
      return NextResponse.json(
        { error: 'deviceId and taskName are required' },
        { status: 400 }
      );
    }

    // Map simple names to GenieACS preset tasks
    const taskMapping: Record<string, any> = {
      reboot: {
        name: 'reboot',
        parameterValues: [],
      },
      factoryReset: {
        name: 'factoryReset',
        parameterValues: [],
      },
      getParameterValues: {
        name: 'refreshObject',
        objectName: '',
      },
    };

    const taskConfig = taskMapping[taskName] || { name: taskName };

    // Use tasks?timeout=10000&connection_request to queue task (timeout tells GenieACS to wait max 10s)
    const response = await fetchWithTimeout(`${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=10000&connection_request`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskConfig),
    });

    if (!response.ok) {
      // GenieACS 504 = device offline / did not respond
      if (response.status === 504) {
        return NextResponse.json(
          { error: 'Device offline atau tidak merespons dalam batas waktu yang ditentukan' },
          { status: 200 }
        );
      }
      const text = await response.text();
      throw new Error(`GenieACS tasks API returned ${response.status}: ${text}`);
    }

    const data = await response.json();

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error queueing GenieACS task:', error);
    if (error?.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Koneksi ke GenieACS timeout. Periksa apakah server GenieACS berjalan.' },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to queue task' },
      { status: 500 }
    );
  }
}
