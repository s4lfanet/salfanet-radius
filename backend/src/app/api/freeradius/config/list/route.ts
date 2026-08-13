import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Base FreeRADIUS configuration directory
const BASE_DIR = '/etc/freeradius/3.0';

// Allowed directories to list
const ALLOWED_DIRS = [
    'sites-enabled',
    'sites-available',
    'mods-enabled',
    'mods-available',
    'policy.d',
    'dictionary.d'
];

interface FileItem {
    name: string;
    path: string; // Relative path from BASE_DIR for ID
    type: 'file' | 'link';
}

interface ConfigGroup {
    id: string;
    name: string;
    files: FileItem[];
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const groups: ConfigGroup[] = [];

        // 1. Add Main Config files manually
        groups.push({
            id: 'main',
            name: 'Main Configuration',
            files: [
                { name: 'radiusd.conf', path: 'radiusd.conf', type: 'file' },
                { name: 'clients.conf', path: 'clients.conf', type: 'file' },
                { name: 'users', path: 'users', type: 'file' },
                { name: 'proxy.conf', path: 'proxy.conf', type: 'file' },
                { name: 'dictionary', path: 'dictionary', type: 'file' },
            ]
        });

        // 2. Scan Allowed Directories
        for (const dirName of ALLOWED_DIRS) {
            const fullPath = path.join(BASE_DIR, dirName);
            const files: FileItem[] = [];

            try {
                // Check if directory exists
                await fs.access(fullPath);
                const entries = await fs.readdir(fullPath, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.isFile() || entry.isSymbolicLink()) {
                        files.push({
                            name: entry.name,
                            path: `${dirName}/${entry.name}`,
                            type: entry.isSymbolicLink() ? 'link' : 'file'
                        });
                    }
                }
            } catch (err) {
                // If dir doesn't exist or access denied, valid case (maybe not installed fully)
                // On Windows Dev, we will return mock data later
            }

            if (files.length > 0 || process.platform === 'win32') {
                groups.push({
                    id: dirName,
                    name: dirName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // "sites-enabled" -> "Sites Enabled"
                    files
                });
            }
        }

        // Mock data for Windows Local Dev environment
        if (process.platform === 'win32') {
            // Populate groups with mock files if empty
            const mocks: Record<string, string[]> = {
                'sites-enabled': ['default', 'inner-tunnel', 'status'],
                'sites-available': ['default', 'inner-tunnel', 'status', 'dhcp', 'copy-acct-to-home-server'],
                'mods-enabled': ['sql', 'eap', 'pap', 'chap', 'mschap', 'files', 'detail'],
                'mods-available': ['sql', 'eap', 'ldap', 'radutmp', 'redis', 'rest'],
                'policy.d': ['accounting', 'filter', 'eap']
            };

            for (const dir of ALLOWED_DIRS) {
                const group = groups.find(g => g.id === dir);
                if (group && group.files.length === 0) {
                    // Add mock files
                    if (mocks[dir]) {
                        group.files = mocks[dir].map(name => ({
                            name,
                            path: `${dir}/${name}`,
                            type: dir.includes('enabled') ? 'link' : 'file'
                        }));
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            groups
        });

    } catch (error: any) {
        console.error('Error listing config directories:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
