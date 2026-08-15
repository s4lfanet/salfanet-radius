import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    try {
        // Stop FreeRADIUS service
        await execAsync('systemctl stop freeradius 2>/dev/null || service freeradius stop 2>/dev/null');

        // Wait a moment for service to stop
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if it's stopped
        const { stdout: statusOutput } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
        const running = statusOutput.trim() === 'active';

        if (running) {
            throw new Error('Service failed to stop');
        }

        return NextResponse.json({
            success: true,
            message: 'FreeRADIUS stopped successfully'
        });

    } catch (error: any) {
        console.error('Error stopping FreeRADIUS:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to stop FreeRADIUS' },
            { status: 500 }
        );
    }
}
