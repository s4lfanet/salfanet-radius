import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

/**
 * GET /api/admin/olt/model-profiles
 * Returns an empty list — olt_model_profiles table not available in this deployment.
 * The OLT management page handles empty profiles gracefully (manual vendor/model input).
 */
export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.relaxed);
  if (limited) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
  }
  return NextResponse.json({ profiles: [] });
}
