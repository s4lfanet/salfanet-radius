import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { seedParameterDisplayConfig } from '../../../../../../../prisma/seeds/parameter-display-config';

// POST - Reset to default configurations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('🔄 Resetting parameter display configurations to defaults...');
    
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
