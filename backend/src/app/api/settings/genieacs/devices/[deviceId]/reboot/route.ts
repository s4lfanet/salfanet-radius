import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '../../../route';

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

// POST - Reboot a specific device
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;
    
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS not configured' },
        { status: 400 }
      );
    }

    const { host, username, password } = credentials;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    // Create reboot task for the device
    const taskBody = {
      name: 'reboot'
    };

    // timeout=10000 tells GenieACS to wait max 10s for device connection
    const response = await fetchWithTimeout(`${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=10000&connection_request`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(taskBody),
    });

    if (!response.ok) {
      if (response.status === 504) {
        return NextResponse.json(
          { success: false, error: 'Device offline atau tidak merespons (timeout 10s)' },
          { status: 200 }
        );
      }
      const errorText = await response.text();
      console.error('GenieACS reboot error:', errorText);
      return NextResponse.json(
        { success: false, error: `Failed to send reboot task: ${response.status}` },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Reboot task sent successfully',
      deviceId
    });

  } catch (error: unknown) {
    console.error('Error rebooting device:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Koneksi ke GenieACS timeout. Periksa apakah server GenieACS berjalan.' },
        { status: 200 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to reboot device';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
