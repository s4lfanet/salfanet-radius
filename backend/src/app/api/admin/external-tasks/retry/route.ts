import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { manualRetryTask } from '@/server/services/external-task.service';
import { z, parseBody } from '@/lib/parse-body';

const retrySchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
});

/**
 * POST /api/admin/external-tasks/retry
 * Manually retry a DEAD external task.
 * Resets retry count and sets status to PENDING for immediate processing.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { data, error } = await parseBody(request, retrySchema);
    if (error) return error;

    await manualRetryTask(data.taskId);
    return NextResponse.json({
      success: true,
      message: 'Task reset to PENDING for retry',
    });
  } catch (error: any) {
    console.error('[External Task Retry Error]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retry task' },
      { status: 500 }
    );
  }
}
