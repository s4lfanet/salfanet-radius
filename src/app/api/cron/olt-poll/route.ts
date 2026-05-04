import { NextRequest, NextResponse } from 'next/server';
import { pollAllOLTs } from '@/lib/olt/poller';

// POST - Trigger OLT polling from cron service
export async function POST(request: NextRequest) {
  // Validate cron secret
  const secret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron OLT Poll] Starting polling all OLTs...');
    await pollAllOLTs();
    console.log('[Cron OLT Poll] Done.');
    return NextResponse.json({ success: true, message: 'OLT polling completed' });
  } catch (error: any) {
    console.error('[Cron OLT Poll]', error);
    return NextResponse.json({ error: 'Polling failed', details: error.message }, { status: 500 });
  }
}
