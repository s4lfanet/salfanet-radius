import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    try {
        // Start FreeRADIUS service
        await execAsync('systemctl start freeradius 2>/dev/null || service freeradius start 2>/dev/null');

        // Wait a moment for service to start
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if it's running
        const { stdout: statusOutput } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
        const running = statusOutput.trim() === 'active';

        if (!running) {
            throw new Error('Service failed to start');
        }

        return NextResponse.json({
            success: true,
            message: 'FreeRADIUS started successfully'
        });

    } catch (error: any) {
        console.error('Error starting FreeRADIUS:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to start FreeRADIUS' },
            { status: 500 }
        );
    }
}
