import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Log file path
const LOG_FILE = '/var/log/freeradius/radius.log'; // Adjust for your system

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const rawLines = parseInt(searchParams.get('lines') || '50', 10);
    const lines = Number.isFinite(rawLines) ? Math.min(Math.max(rawLines, 1), 1000) : 50;

    // Check if log file exists
    if (!fs.existsSync(LOG_FILE)) {
        // Fallback for demo on Windows
        if (process.platform === 'win32') {
            const demoLogs = Array.from({ length: lines }, (_, i) => {
                const date = new Date(Date.now() - i * 1000).toISOString();
                const type = i % 10 === 0 ? 'Info' : (i % 5 === 0 ? 'Auth' : 'Debug');
                return `${date} : ${type}: Demo log entry #${i} detailed message here...`;
            }).reverse().join('\n');

            return NextResponse.json({
                success: true,
                logs: demoLogs
            });
        }

        return NextResponse.json(
            { success: false, error: 'Log file not found' },
            { status: 404 }
        );
    }

    // Create promises for exec
    const readLogs = () => new Promise<string>((resolve, reject) => {
        const tail = spawn('tail', ['-n', lines.toString(), LOG_FILE]);
        let output = '';
        let error = '';

        tail.stdout.on('data', (data) => {
            output += data.toString();
        });

        tail.stderr.on('data', (data) => {
            error += data.toString();
        });

        tail.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(error || `Tail process exited with code ${code}`));
            }
        });
    });

    try {
        const logs = await readLogs();
        return NextResponse.json({
            success: true,
            logs
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
