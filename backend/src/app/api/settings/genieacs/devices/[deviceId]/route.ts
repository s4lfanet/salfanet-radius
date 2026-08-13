import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '../../route';

// DELETE - Delete a specific device from GenieACS
export async function DELETE(
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

    // Delete device from GenieACS
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${host}/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Device not found in GenieACS' },
          { status: 404 }
        );
      }
      const errorText = await response.text();
      console.error('GenieACS delete error:', errorText);
      return NextResponse.json(
        { success: false, error: `Failed to delete device: ${response.status}` },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Device deleted successfully',
      deviceId
    });

  } catch (error: unknown) {
    console.error('Error deleting device:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Koneksi ke GenieACS timeout.' },
        { status: 200 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete device';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
