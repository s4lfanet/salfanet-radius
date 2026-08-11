import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { username, password, nasIP, nasPort, secret } = await req.json();

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: 'Username and password are required' },
                { status: 400 }
            );
        }

        const command = `radtest "${username}" "${password}" ${nasIP || '127.0.0.1'} ${nasPort || 1812} "${secret || 'testing123'}"`;

        // Execute radtest command
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';

        try {
            const result = await execAsync(command);
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (error: any) {
            // radtest might return non-zero exit code on Access-Reject, which throws an error
            // We still want to parse the output
            stdout = error.stdout || '';
            stderr = error.stderr || '';
        }

        const duration = Date.now() - startTime;
        const rawOutput = stdout + stderr;

        // Parse output
        const isAccessAccept = rawOutput.includes('Access-Accept');
        const isAccessReject = rawOutput.includes('Access-Reject');
        const responseType = isAccessAccept ? 'Access-Accept' : (isAccessReject ? 'Access-Reject' : 'Unknown');
        const responseCode = isAccessAccept ? '200' : '401'; // Simplified code

        // Parse attributes
        const attributes: { name: string; value: string }[] = [];
        const lines = rawOutput.split('\n');
        let parsingAttributes = false;

        for (const line of lines) {
            if (line.includes('Received Access-Accept') || line.includes('Received Access-Reject')) {
                parsingAttributes = true;
                continue;
            }

            if (parsingAttributes) {
                const match = line.match(/^\s*([^=\s]+)\s*=\s*(.+)$/);
                if (match) {
                    attributes.push({ name: match[1], value: match[2].trim() });
                }
            }
        }

        return NextResponse.json({
            success: true,
            result: {
                success: isAccessAccept,
                responseCode,
                responseType,
                duration,
                attributes,
                rawOutput
            }
        });

    } catch (error: any) {
        console.error('Error running radtest:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to run radtest' },
            { status: 500 }
        );
    }
}
