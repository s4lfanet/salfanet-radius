import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

// Helper: fetch with AbortController timeout (15s default)
async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// POST - Trigger connection request to device
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;

    // Get GenieACS credentials
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS belum dikonfigurasi' },
        { status: 400 }
      );
    }

    const { host, username, password } = credentials;

    if (!host) {
      return NextResponse.json(
        { success: false, error: 'GenieACS host tidak dikonfigurasi' },
        { status: 400 }
      );
    }

    const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

    // Create empty task with connection_request to trigger device
    // This will force the device to connect and execute any pending tasks
    // timeout=10000 tells GenieACS to wait max 10s for device to come online
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=10000&connection_request`;

    console.log('Triggering connection request for device:', deviceId);

    // Send a simple getParameterValues task to trigger connection
    const task = {
      name: 'getParameterValues',
      parameterNames: ['InternetGatewayDevice.DeviceInfo.SoftwareVersion']
    };

    const response = await fetchWithTimeout(taskUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`
      },
      body: JSON.stringify(task)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Connection request error:', errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Device tidak ditemukan di GenieACS' },
          { status: 404 }
        );
      }

      // GenieACS 504 = device offline / did not respond within timeout
      if (response.status === 504) {
        return NextResponse.json(
          { success: false, error: 'Device offline atau tidak merespons (timeout)' },
          { status: 200 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: `Gagal mengirim connection request: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('Connection request result:', result);

    return NextResponse.json({
      success: true,
      message: 'Connection request dikirim ke device',
      taskId: result._id
    });

  } catch (error) {
    console.error('Error triggering connection request:', error);
    // AbortError = Node.js fetch timed out (15s safety net)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Koneksi ke GenieACS timeout. Periksa apakah server GenieACS berjalan.' },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan' },
      { status: 500 }
    );
  }
}
