import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

// Helper to verify customer token
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });
    if (!session) return null;

    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: { username: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const credentials = await getGenieACSCredentials();
    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS tidak dikonfigurasi' },
        { status: 503 }
      );
    }

    const { host, username, password } = credentials;
    const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    // Find device by PPPoE username (try multiple virtual parameter fields)
    let deviceId: string | null = null;
    const vpFields = ['pppoeUsername', 'pppoeUsername2', 'pppUsername'];

    for (const vpField of vpFields) {
      if (deviceId) break;

      const query = JSON.stringify({
        [`VirtualParameters.${vpField}._value`]: user.username,
      });
      const devicesUrl = `${host}/devices?query=${encodeURIComponent(query)}&projection=${encodeURIComponent('_id')}`;

      const response = await fetch(devicesUrl, {
        method: 'GET',
        headers: { Authorization: auth },
      });

      if (!response.ok) continue;

      const devices = await response.json();
      if (Array.isArray(devices) && devices.length > 0) {
        deviceId = devices[0]._id;
      }
    }

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Perangkat tidak ditemukan di GenieACS' },
        { status: 404 }
      );
    }

    // Send reboot task
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`;
    const taskResponse = await fetch(taskUrl, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'reboot' }),
    });

    if (!taskResponse.ok) {
      return NextResponse.json(
        { success: false, error: `GenieACS returned ${taskResponse.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Perintah reboot berhasil dikirim. Perangkat akan restart dalam beberapa detik.',
    });
  } catch (error) {
    console.error('ONT reboot error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
