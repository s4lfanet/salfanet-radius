import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

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
        const { filename, content } = await req.json();

        if (!filename) {
            return NextResponse.json(
                { success: false, error: 'Filename is required' },
                { status: 400 }
            );
        }

        if (typeof content !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Content must be a string' },
                { status: 400 }
            );
        }

        // Security Check: Prevent directory traversal
        const normalizedPath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
        const dirName = path.dirname(normalizedPath);

        const isAllowed = ALLOWED_DIRS.some(allowed =>
            dirName === '.' ? true : (allowed === dirName || dirName.startsWith(allowed))
        );

        if (!isAllowed) {
            return NextResponse.json(
                { success: false, error: 'Access denied: Directory not allowed' },
                { status: 403 }
            );
        }

        const filePath = path.join(BASE_DIR, normalizedPath);

        // Create backup before saving
        const backupPath = `${filePath}.bak.${Date.now()}`;

        // Skip backup/save logic on Windows Dev
        if (process.platform === 'win32') {
            console.log(`[Mock Save] Would save to ${filePath}`);
            console.log(`[Mock Content Length] ${content.length} chars`);
            return NextResponse.json({
                success: true,
                message: 'File saved successfully (Mock)'
            });
        }

        try {
            await fs.copyFile(filePath, backupPath);
        } catch (err) {
            console.warn(`Failed to create backup: ${err}`);
        }

        // Write new content
        await fs.writeFile(filePath, content, 'utf8');

        // Check config syntax
        try {
            await execAsync('freeradius -C');
        } catch (err: any) {
            // If syntax check fails, restore backup!
            await fs.copyFile(backupPath, filePath);
            return NextResponse.json(
                { success: false, error: `Config syntax check failed! Changes reverted. Error: ${err.stderr || err.message}` },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'File saved successfully'
        });

    } catch (error: any) {
        console.error('Error saving config file:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to save file' },
            { status: 500 }
        );
    }
}
