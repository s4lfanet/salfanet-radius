import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
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
