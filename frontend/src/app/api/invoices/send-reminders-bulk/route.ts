import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Invoice reminders have been migrated to NestJS backend cron
// This legacy route delegates to the backend API

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const token = (session as any).accessToken || '';
        const res = await fetch(`${BACKEND_URL}/api/v1/cron/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: 'invoice_reminder' }),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to send bulk reminders' },
            { status: 500 }
        );
    }
}
