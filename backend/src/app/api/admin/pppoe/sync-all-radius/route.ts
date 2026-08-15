import { NextRequest } from 'next/server';
import { ok, unauthorized, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { enqueueFailedSync, syncSingleUserToRadius } from '@/server/services/radius/radius-sync-queue.service';

// POST /api/admin/pppoe/sync-all-radius
// Re-sync ALL pppoe_users → radcheck / radusergroup / radreply
// Safe to call repeatedly (idempotent — delete then re-insert per user).
// Includes nas_identifier (router.id) for multi-NAS isolation.
// Uses batch processing to avoid large transactions.
// Failed syncs are enqueued for automatic retry with exponential backoff.
export async function POST(_request: NextRequest) {
  const auth = await requirePermission('customers.edit');
  if (!auth.authorized) return auth.response;

  try {
    const users = await prisma.pppoeUser.findMany({
      select: { id: true, username: true },
    });

    const BATCH_SIZE = 50;
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      // Process each user in the batch independently
      // A failure in one user does not block others
      await Promise.allSettled(
        batch.map(async (user) => {
          try {
            await syncSingleUserToRadius(user.id);
            synced++;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            failed++;
            errors.push(`${user.username}: ${message}`);
            // Enqueue for automatic retry
            await enqueueFailedSync(user.id, user.username, 'full', message).catch(() => {
              // Don't let enqueue failure block the sync report
            });
          }
        })
      );
    }

    return ok({
      success: true,
      message: `Sync selesai: ${synced} berhasil, ${failed} gagal`,
      synced,
      failed,
      totalUsers: users.length,
      errors: errors.slice(0, 20),
      note: failed > 0 ? `${failed} failed syncs enqueued for automatic retry` : undefined,
    });
  } catch (error) {
    console.error('[sync-all-radius] error:', error);
    return serverError();
  }
}
