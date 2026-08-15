import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { sendTelegramMessage } from '@/server/services/notifications/telegram.service';
import { formatInTimeZone } from 'date-fns-tz';
import { getCurrentTimezone } from '@/lib/timezone';

// POST - Test Telegram connection
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const { botToken, chatId, backupTopicId, healthTopicId } = body;

    if (!botToken || !chatId) {
      return NextResponse.json(
        { error: 'Bot token and chat ID are required' },
        { status: 400 }
      );
    }

    const now = formatInTimeZone(new Date(), getCurrentTimezone(), 'dd MMM yyyy HH:mm');
    const results = [];

    // 1. Send to General Chat (no topic)
    const generalResult = await sendTelegramMessage(
      { botToken, chatId },
      `🤖 <b>SALFANET RADIUS - Test Connection</b>\n\n✅ General chat connection successful!\n\n📅 ${now} WIB`
    );
    results.push({ location: 'General Chat', success: generalResult.success, error: generalResult.error });

    // 2. Send to Backup Topic (if provided)
    if (backupTopicId) {
      const backupResult = await sendTelegramMessage(
        { botToken, chatId, topicId: backupTopicId },
        `💾 <b>SALFANET RADIUS - Database Backup Topic Test</b>\n\n✅ Backup topic connection successful!\nThis topic will receive database backup files.\n\n📅 ${now} WIB`
      );
      results.push({ location: 'Backup Topic', success: backupResult.success, error: backupResult.error });
    }

    // 3. Send to Health Topic (if provided)
    if (healthTopicId) {
      const healthResult = await sendTelegramMessage(
        { botToken, chatId, topicId: healthTopicId },
        `🏥 <b>SALFANET RADIUS - Health Check Topic Test</b>\n\n✅ Health topic connection successful!\nThis topic will receive database health reports.\n\n📅 ${now} WIB`
      );
      results.push({ location: 'Health Topic', success: healthResult.success, error: healthResult.error });
    }

    // Check if all tests passed
    const allSuccess = results.every(r => r.success);
    const failedTests = results.filter(r => !r.success);

    if (!allSuccess) {
      return NextResponse.json(
        { 
          success: false,
          error: `Some tests failed: ${failedTests.map(f => `${f.location} (${f.error})`).join(', ')}`,
          results 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test messages sent to ${results.length} location(s)!`,
      results,
    });
  } catch (error: any) {
    console.error('[Telegram Test] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to test connection' },
      { status: 500 }
    );
  }
}
