import { NextRequest, NextResponse } from 'next/server';
import { sendInvoiceReminders } from '@/server/jobs/voucher-sync';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * POST /api/invoices/send-reminders-bulk
 * Manually trigger bulk invoice reminders (bypass time check)
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log('[Bulk Reminder] Manual trigger by:', (session.user as any)?.username);

        // Call sendInvoiceReminders with force=true to bypass time check
        const result = await sendInvoiceReminders(true);

        return NextResponse.json({
            success: result.success,
            message: `Sent ${result.sent} reminders, skipped ${result.skipped}`,
            sent: result.sent,
            skipped: result.skipped,
            error: result.error,
        });
    } catch (error: any) {
        console.error('[Bulk Reminder] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to send bulk reminders',
            },
            { status: 500 }
        );
    }
}
