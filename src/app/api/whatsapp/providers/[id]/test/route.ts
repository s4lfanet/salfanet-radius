import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import axios from 'axios';
import { nanoid } from 'nanoid';
import { formatWIB } from '@/lib/timezone';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Test provider
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number required' },
        { status: 400 }
      );
    }

    const provider = await prisma.whatsapp_providers.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider not found' },
        { status: 404 }
      );
    }

    const testMessage = `🧪 *Test Message from SALFANET RADIUS*

This is a test message from WhatsApp Provider: *${provider.name}*

Provider Type: ${provider.type.toUpperCase()}
Test Time: ${formatWIB(new Date())}

If you receive this message, the provider is working correctly! ✅`;

    let success = false;
    let responseData: any = null;
    let errorMessage: string | null = null;

    try {
      switch (provider.type) {
        case 'fonnte':
          const fonnteRes = await axios.post(
            provider.apiUrl,
            {
              target: phone,
              message: testMessage,
              countryCode: '62',
            },
            {
              headers: {
                Authorization: provider.apiKey,
              },
            }
          );
          responseData = fonnteRes.data;
          success = fonnteRes.data.status === true || fonnteRes.data.success === true;
          break;

        case 'waha':
          const wahaRes = await axios.post(
            `${provider.apiUrl}/api/sendText`,
            {
              chatId: `${phone}@c.us`,
              text: testMessage,
              session: 'default',
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': provider.apiKey,
              },
            }
          );
          responseData = wahaRes.data;
          success = wahaRes.status === 200 || wahaRes.status === 201;
          break;

        case 'mpwa': {
          // MPWA uses GET with query params (consistent with main service)
          const mpwaUrl = new URL(`${provider.apiUrl}/send-message`);
          mpwaUrl.searchParams.append('api_key', provider.apiKey);
          mpwaUrl.searchParams.append('sender', provider.senderNumber || '');
          mpwaUrl.searchParams.append('number', phone);
          mpwaUrl.searchParams.append('message', testMessage);
          const mpwaRes = await axios.get(mpwaUrl.toString());
          responseData = mpwaRes.data;
          success = mpwaRes.data.success === true || mpwaRes.data.status === 'success';
          if (!success) {
            errorMessage = mpwaRes.data.message || 'MPWA: failed to send';
          }
          break;
        }

        case 'wablas': {
          // Wablas API V2 — POST JSON to /api/v2/send-message
          // Authorization: {token}.{secret_key}
          const wablasRes = await axios.post(
            `${provider.apiUrl}/api/v2/send-message`,
            {
              data: [
                { phone, message: testMessage, flag: 'instant' },
              ],
            },
            {
              headers: {
                Authorization: provider.apiKey,
                'Content-Type': 'application/json',
              },
            }
          );
          responseData = wablasRes.data;
          success = wablasRes.data.status === true;
          if (!success) {
            errorMessage = wablasRes.data.message || 'Wablas: failed to send';
          }
          break;
        }

        case 'gowa': {
          const gowaHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (provider.apiKey && provider.apiKey.includes(':')) {
            const base64Auth = Buffer.from(provider.apiKey).toString('base64');
            gowaHeaders['Authorization'] = `Basic ${base64Auth}`;
          }
          const gowaPhone = phone.replace(/[^0-9]/g, '');
          const gowaRes = await axios.post(
            `${provider.apiUrl}/send/message`,
            { phone: gowaPhone, message: testMessage },
            { headers: gowaHeaders }
          );
          responseData = gowaRes.data;
          success = gowaRes.data.code === 'SUCCESS';
          if (!success) errorMessage = gowaRes.data.message || 'GOWA: failed to send';
          break;
        }

        case 'kirimi': {
          const [kiriminUserCode, kiriminSecret] = (provider.apiKey || '').split(':');
          if (!kiriminUserCode || !kiriminSecret) {
            errorMessage = 'Kirimi.id API Key harus format "user_code:secret"';
            break;
          }
          const kirimRes = await axios.post(
            `${provider.apiUrl}/send-message`,
            {
              user_code: kiriminUserCode,
              secret: kiriminSecret,
              device_id: provider.senderNumber || '',
              number: phone,
              message: testMessage,
            },
            { headers: { 'Content-Type': 'application/json' } }
          );
          responseData = kirimRes.data;
          success = kirimRes.data.success === true;
          if (!success) errorMessage = kirimRes.data.message || 'Kirimi.id: failed to send';
          break;
        }

        case 'wablast': {
          // WABlast self-hosted gateway — POST JSON to /send-message
          const wablastRes = await axios.post(
            `${provider.apiUrl}/send-message`,
            { phone, message: testMessage },
            {
              headers: {
                'Authorization': provider.apiKey,
                'Content-Type': 'application/json',
              },
            }
          );
          responseData = wablastRes.data;
          success = wablastRes.data.status !== false && wablastRes.data.status !== 'error';
          if (!success) errorMessage = wablastRes.data.message || 'WABlast: failed to send';
          break;
        }

        default:
          errorMessage = `Unknown provider type: ${provider.type}`;
          break;
      }
    } catch (error: any) {
      console.error('Provider test failed:', error);
      errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      responseData = error.response?.data;
    }

    // Log test result
    await prisma.whatsapp_history.create({
      data: {
        id: nanoid(),
        phone,
        message: testMessage,
        status: success ? 'sent' : 'failed',
        response: JSON.stringify({ provider: provider.name, responseData, errorMessage }),
      },
    });

    return NextResponse.json({
      success,
      error: errorMessage,
      response: responseData,
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
      },
    });
  } catch (error: any) {
    console.error('Test provider error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to test provider' },
      { status: 500 }
    );
  }
}
