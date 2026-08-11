import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

// POST - Retry a failed task
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { taskId } = await params;

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

    // Retry task by sending POST to tasks/{taskId}/retry
    const response = await fetch(`${host}/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`
      }
    });

    if (!response.ok) {
      // If retry endpoint doesn't exist, try to clear fault by updating the task
      const clearFaultResponse = await fetch(`${host}/faults/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${authHeader}`
        }
      });

      if (!clearFaultResponse.ok) {
        return NextResponse.json(
          { success: false, error: `Gagal retry task: ${response.status}` },
          { status: response.status }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Task akan di-retry'
    });

  } catch (error) {
    console.error('Error retrying task:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan' },
      { status: 500 }
    );
  }
}
