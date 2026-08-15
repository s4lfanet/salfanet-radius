import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { sendHealthReport } from '@/server/services/notifications/telegram.service';

// POST - Send health check to Telegram
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

    // Get Telegram settings
    const settings = await prisma.telegramBackupSettings.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'Telegram backup is not enabled or configured' },
        { status: 400 }
      );
    }

    // Get database health (simplified version)
    const health = await getDatabaseHealth();

    // Send to Telegram
    const result = await sendHealthReport(
      {
        botToken: settings.botToken,
        chatId: settings.chatId,
        topicId: settings.healthTopicId || undefined,
      },
      health
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send health report to Telegram' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Health report sent to Telegram successfully!',
    });
  } catch (error: any) {
    console.error('[Telegram Send Health] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send health report' },
      { status: 500 }
    );
  }
}

async function getDatabaseHealth() {
  try {
    // Get database size
    const sizeResult: any = await prisma.$queryRawUnsafe(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
      FROM information_schema.TABLES 
      WHERE table_schema = DATABASE()
    `);

    // Get table count
    const tableResult: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count 
      FROM information_schema.TABLES 
      WHERE table_schema = DATABASE()
    `);

    // Get connection count
    const connectionResult: any = await prisma.$queryRawUnsafe(`
      SHOW STATUS LIKE 'Threads_connected'
    `);

    // Get uptime
    const uptimeResult: any = await prisma.$queryRawUnsafe(`
      SHOW STATUS LIKE 'Uptime'
    `);

    const sizeMB = sizeResult[0]?.size_mb || 0;
    const tableCount = Number(tableResult[0]?.count) || 0;
    const connections = connectionResult[0]?.Value || '0';
    const uptimeSeconds = Number(uptimeResult[0]?.Value) || 0;
    
    // Convert uptime to human readable
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptime = `${days}d ${hours}h`;

    // Determine status
    let status = 'healthy';
    if (sizeMB > 1000 || Number(connections) > 50) {
      status = 'warning';
    }
    if (sizeMB > 5000 || Number(connections) > 100) {
      status = 'critical';
    }

    return {
      status,
      size: `${sizeMB} MB`,
      tables: tableCount,
      connections: connections,
      uptime,
    };
  } catch (error) {
    console.error('[Database Health] Error:', error);
    return {
      status: 'unknown',
      size: 'N/A',
      tables: 0,
      connections: 'N/A',
      uptime: 'N/A',
    };
  }
}
