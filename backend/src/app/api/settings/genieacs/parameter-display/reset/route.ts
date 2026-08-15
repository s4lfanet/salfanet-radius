import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { seedParameterDisplayConfig } from '../../../../../../../prisma/seeds/parameter-display-config';

// POST - Reset to default configurations
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.genieacs');
  if (!authCheck.authorized) return authCheck.response;
  try {
    console.log('Resetting parameter display configurations to defaults...');
    
    // Run the seed function
    await seedParameterDisplayConfig();

    console.log('✅ Parameter display configurations reset successfully');

    return NextResponse.json({
      success: true,
      message: 'Configurations reset to defaults successfully'
    });
  } catch (error: any) {
    console.error('❌ Error resetting parameter display configs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
