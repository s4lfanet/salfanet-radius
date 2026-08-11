import { NextResponse } from 'next/server';

/**
 * GET /api/admin/olt/model-profiles
 * Returns an empty list — olt_model_profiles table not available in this deployment.
 * The OLT management page handles empty profiles gracefully (manual vendor/model input).
 */
export async function GET() {
  return NextResponse.json({ profiles: [] });
}
