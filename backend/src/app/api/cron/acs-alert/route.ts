import { NextRequest, NextResponse } from 'next/server';
import { runAcsAlert } from '@/lib/genieacs/acs-alert';

// POST - Trigger ACS (GenieACS) alert check from cron service
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAcsAlert();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Cron ACS Alert]', error);
    return NextResponse.json(
      { error: 'ACS alert check failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
