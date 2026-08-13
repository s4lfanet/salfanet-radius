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
        // Restart FreeRADIUS service
        await execAsync('systemctl restart freeradius 2>/dev/null || service freeradius restart 2>/dev/null');

        // Wait a moment for service to restart
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if it's running
        const { stdout: statusOutput } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
        const running = statusOutput.trim() === 'active';

        if (!running) {
            throw new Error('Service failed to restart');
        }

        return NextResponse.json({
            success: true,
            message: 'FreeRADIUS restarted successfully'
        });

    } catch (error: any) {
        console.error('Error restarting FreeRADIUS:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to restart FreeRADIUS' },
            { status: 500 }
        );
    }
}
