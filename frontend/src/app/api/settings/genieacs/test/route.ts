import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// POST - Test GenieACS connection
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { host, username, password } = body;

    if (!host || !username || !password) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Host, username, and password are required' 
        },
        { status: 400 }
      );
    }

    // Validate host URL format
    let validatedHost = host;
    try {
      const url = new URL(host);
      validatedHost = url.origin; // Ensure clean URL
    } catch {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid host URL format. Please use format like http://192.168.1.100:7557' 
        },
        { status: 400 }
      );
    }

    // Test connection by fetching devices with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(`${validatedHost}/devices?limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          return NextResponse.json(
            { 
              success: false,
              error: 'Authentication failed. Invalid username or password.' 
            },
            { status: 200 } // Return 200 so frontend can handle properly
          );
        }
        throw new Error(`GenieACS returned status ${response.status}`);
      }

      const data = await response.json();
      const deviceCount = Array.isArray(data) ? data.length : 0;

      return NextResponse.json({
        success: true,
        message: `Connection successful! Found ${deviceCount} device(s).`,
        deviceCount,
        host: validatedHost
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { 
            success: false,
            error: 'Connection timeout. Please check if GenieACS server is running and accessible.' 
          },
          { status: 200 }
        );
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('Error testing GenieACS connection:', error);
    
    let errorMessage = 'Connection failed. Please check your settings.';
    
    if (error.message?.includes('fetch failed') || error.cause?.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to GenieACS server. Please check:\n- The host URL is correct\n- GenieACS server is running\n- Network/firewall allows the connection';
    } else if (error.message?.includes('ENOTFOUND')) {
      errorMessage = 'Host not found. Please check the host URL.';
    } else if (error.message?.includes('ETIMEDOUT')) {
      errorMessage = 'Connection timed out. Please check if the server is accessible.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { 
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 200 } // Return 200 so frontend can handle gracefully
    );
  }
}
