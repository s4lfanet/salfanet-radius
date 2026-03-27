import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import fs from 'fs/promises';
import path from 'path';

// Base FreeRADIUS configuration directory
const BASE_DIR = '/etc/freeradius/3.0';

// Allowed directories (whitelist for security)
const ALLOWED_DIRS = [
    '.', // base dir
    'sites-enabled',
    'sites-available',
    'mods-enabled',
    'mods-available',
    'policy.d',
    'dictionary.d'
];

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { filename } = await req.json();

        if (!filename) {
            return NextResponse.json(
                { success: false, error: 'Filename is required' },
                { status: 400 }
            );
        }

        // Security Check: Prevent directory traversal
        // The filename should be relative path like "radiusd.conf" or "sites-enabled/default"
        const normalizedPath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
        const dirName = path.dirname(normalizedPath);

        // Check if directory is allowed (exact match or sub-path)
        const isAllowed = ALLOWED_DIRS.some(allowed =>
            allowed === dirName || dirName.startsWith(allowed + '/')
        );

        if (!isAllowed) {
            return NextResponse.json(
                { success: false, error: 'Access denied: Directory not allowed' },
                { status: 403 }
            );
        }

        const fullPath = path.join(BASE_DIR, normalizedPath);

        try {
            // Check if file exists
            // await fs.access(fullPath); // skip this for windows mock fallback below to work

            const content = await fs.readFile(fullPath, 'utf8');

            return NextResponse.json({
                success: true,
                content
            });
        } catch (err: any) {
            // Fallback for Windows Dev Environment
            if (process.platform === 'win32') {
                // Return some realistic looking mock content based on file type
                let mockContent = `# Mock content for ${filename}\n# Path: ${fullPath}\n\n`;

                if (filename.includes('sites-')) {
                    mockContent += `server ${path.basename(filename)} {\n\tlisten {\n\t\ttype = auth\n\t\tipaddr = *\n\t\tport = 1812\n\t}\n\n\tauthorize {\n\t\tsql\n\t\teap\n\t}\n}`;
                } else if (filename.includes('mods-')) {
                    mockContent += `${path.basename(filename)} {\n\tdriver = "rlm_${path.basename(filename)}"\n\t# Module configuration...\n}`;
                } else if (filename === 'radiusd.conf') {
                    mockContent += `prefix = /usr\nexec_prefix = /usr\nsysconfdir = /etc\n\nlog {\n\tdestination = files\n\tfile = \${logdir}/radius.log\n}`;
                }

                return NextResponse.json({
                    success: true,
                    content: mockContent
                });
            }

            return NextResponse.json(
                { success: false, error: 'File not found or unreadable' },
                { status: 404 }
            );
        }

    } catch (error: any) {
        console.error('Error reading config file:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to read file' },
            { status: 500 }
        );
    }
}
