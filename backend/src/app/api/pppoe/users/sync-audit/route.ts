import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { RouterOSAPI } from 'node-routeros';
import { getMikrotikProfileName, managePppSecret } from '@/server/services/mikrotik/ppp-secret.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface MtSecret {
  '.id': string;
  name: string;
  password: string;
  service: string;
  profile: string;
  disabled: string;
  comment?: string;
  'remote-address'?: string;
}

interface DiffEntry {
  username: string;
  routerId: string;
  routerName: string;
  type: 'missing_in_mikrotik' | 'missing_in_db' | 'password_mismatch' | 'profile_mismatch' | 'status_mismatch';
  db: {
    password?: string;
    profile?: string;
    status?: string;
  };
  mikrotik: {
    password?: string;
    profile?: string;
    disabled?: string;
  };
  message: string;
}

interface SyncAuditResponse {
  success: boolean;
  router: { id: string; name: string; ipAddress: string; authMode: string };
  stats: {
    dbCount: number;
    mtCount: number;
    matched: number;
    missingInMikrotik: number;
    missingInDb: number;
    passwordMismatch: number;
    profileMismatch: number;
    statusMismatch: number;
  };
  differences: DiffEntry[];
  error?: string;
}

async function fetchMikrotikSecrets(router: { id: string; name: string; nasname: string; ipAddress: string | null; username: string | null; password: string | null; port: number | null }): Promise<MtSecret[]> {
  const host = router.ipAddress || router.nasname;
  const apiPort = router.port || 8728;
  let api: any;
  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 15,
    });
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000),
      ),
    ]);
    const secrets = (await api.write('/ppp/secret/print')) as MtSecret[];
    return secrets;
  } finally {
    try { if (api) await api.close(); } catch { /* ignore */ }
  }
}

/**
 * GET /api/pppoe/users/sync-audit?routerId=xxx
 * Compare PPPoE users in DB vs PPP secrets in MikroTik.
 * Shows differences: missing, password mismatch, profile mismatch, status mismatch.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const routerId = searchParams.get('routerId');

    if (!routerId) {
      return NextResponse.json({ success: false, error: 'Router ID is required' }, { status: 400 });
    }

    const router = await prisma.router.findUnique({
      where: { id: routerId },
      select: {
        id: true, name: true, nasname: true, ipAddress: true,
        username: true, password: true, port: true, authMode: true,
        isActive: true, type: true,
      },
    });

    if (!router) {
      return NextResponse.json({ success: false, error: 'Router not found' }, { status: 404 });
    }

    if (!router.isActive || router.type !== 'mikrotik') {
      return NextResponse.json({ success: false, error: 'Router is not active or not MikroTik type' }, { status: 400 });
    }

    if (!router.username || !router.password) {
      return NextResponse.json({ success: false, error: 'Router missing API credentials' }, { status: 400 });
    }

    // Fetch DB users for this router
    const dbUsers = await prisma.pppoeUser.findMany({
      where: {
        routerId: router.id,
        status: { in: ['active', 'isolated'] },
      },
      select: {
        username: true,
        password: true,
        status: true,
        profileId: true,
        profile: { select: { id: true, groupName: true, name: true, mikrotikProfileName: true } },
      },
    });

    // Fetch MikroTik secrets
    let mtSecrets: MtSecret[] = [];
    let fetchError: string | undefined;
    try {
      mtSecrets = await fetchMikrotikSecrets(router);
    } catch (e: any) {
      fetchError = e?.message || 'Failed to connect to MikroTik';
    }

    const dbMap = new Map(dbUsers.map(u => [u.username, u]));
    const mtMap = new Map(mtSecrets.map(s => [s.name, s]));

    const differences: DiffEntry[] = [];
    let matched = 0;

    // Check DB users against MikroTik
    for (const dbUser of dbUsers) {
      const mtSecret = mtMap.get(dbUser.username);

      if (!mtSecret) {
        differences.push({
          username: dbUser.username,
          routerId: router.id,
          routerName: router.name,
          type: 'missing_in_mikrotik',
          db: {
            password: dbUser.password,
            profile: dbUser.profile?.groupName || dbUser.profile?.name || '',
            status: dbUser.status,
          },
          mikrotik: {},
          message: `User ada di database tapi tidak ada di MikroTik (profile: ${dbUser.profile?.groupName || dbUser.profile?.name || 'tanpa paket'})`,
        });
        continue;
      }

      // Compare password
      const mtPassword = mtSecret.password || '';
      if (dbUser.password !== mtPassword) {
        differences.push({
          username: dbUser.username,
          routerId: router.id,
          routerName: router.name,
          type: 'password_mismatch',
          db: { password: dbUser.password },
          mikrotik: { password: mtPassword },
          message: `Password berbeda — DB: "${dbUser.password}" vs MikroTik: "${mtPassword}"`,
        });
      }

      // Compare profile
      const expectedMtProfile = dbUser.profile
        ? (dbUser.profile.mikrotikProfileName || dbUser.profile.groupName || dbUser.profile.name)
        : '';
      const actualMtProfile = mtSecret.profile || '';
      if (expectedMtProfile && actualMtProfile && expectedMtProfile !== actualMtProfile) {
        differences.push({
          username: dbUser.username,
          routerId: router.id,
          routerName: router.name,
          type: 'profile_mismatch',
          db: { profile: expectedMtProfile, status: dbUser.status },
          mikrotik: { profile: actualMtProfile },
          message: `Profile berbeda — DB: "${expectedMtProfile}" vs MikroTik: "${actualMtProfile}"`,
        });
      } else if (!expectedMtProfile && actualMtProfile && dbUser.status === 'isolated') {
        // Isolated user might have isolir profile in MikroTik — that's expected
        // Skip if the MT profile is an isolir profile
      } else if (!expectedMtProfile && actualMtProfile) {
        differences.push({
          username: dbUser.username,
          routerId: router.id,
          routerName: router.name,
          type: 'profile_mismatch',
          db: { profile: '(tanpa paket)', status: dbUser.status },
          mikrotik: { profile: actualMtProfile },
          message: `User tidak punya profile di DB tapi ada profile "${actualMtProfile}" di MikroTik`,
        });
      }

      // Compare status (disabled state)
      const mtDisabled = mtSecret.disabled === 'true' || mtSecret.disabled === 'yes';
      const dbIsolated = dbUser.status === 'isolated';
      if (mtDisabled !== dbIsolated) {
        // Only flag if the mismatch is significant:
        // - DB active but MT disabled → problem
        // - DB isolated but MT enabled → problem
        differences.push({
          username: dbUser.username,
          routerId: router.id,
          routerName: router.name,
          type: 'status_mismatch',
          db: { status: dbUser.status },
          mikrotik: { disabled: mtSecret.disabled },
          message: `Status berbeda — DB: ${dbUser.status} vs MikroTik: disabled=${mtSecret.disabled}`,
        });
      }

      // If no differences found, count as matched
      if (dbUser.password === mtPassword &&
          (expectedMtProfile === actualMtProfile || (!expectedMtProfile && !actualMtProfile)) &&
          mtDisabled === dbIsolated) {
        matched++;
      }
    }

    // Check MikroTik secrets not in DB
    for (const mtSecret of mtSecrets) {
      if (!dbMap.has(mtSecret.name)) {
        differences.push({
          username: mtSecret.name,
          routerId: router.id,
          routerName: router.name,
          type: 'missing_in_db',
          db: {},
          mikrotik: {
            password: mtSecret.password,
            profile: mtSecret.profile,
            disabled: mtSecret.disabled,
          },
          message: `Secret ada di MikroTik tapi tidak ada di database (profile: ${mtSecret.profile || 'default'}, disabled: ${mtSecret.disabled})`,
        });
      }
    }

    const stats = {
      dbCount: dbUsers.length,
      mtCount: mtSecrets.length,
      matched,
      missingInMikrotik: differences.filter(d => d.type === 'missing_in_mikrotik').length,
      missingInDb: differences.filter(d => d.type === 'missing_in_db').length,
      passwordMismatch: differences.filter(d => d.type === 'password_mismatch').length,
      profileMismatch: differences.filter(d => d.type === 'profile_mismatch').length,
      statusMismatch: differences.filter(d => d.type === 'status_mismatch').length,
    };

    const response: SyncAuditResponse = {
      success: true,
      router: {
        id: router.id,
        name: router.name,
        ipAddress: router.ipAddress || router.nasname,
        authMode: router.authMode || 'local',
      },
      stats,
      differences,
    };

    if (fetchError) {
      response.error = fetchError;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Sync audit error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed sync audit' }, { status: 500 });
  }
}

/**
 * POST /api/pppoe/users/sync-audit
 * Fix mismatches by syncing DB data → MikroTik.
 * Body: { routerId, fixes: [{ username, action }] }
 * Actions: 'create_secret' | 'update_password' | 'update_profile' | 'update_status' | 'delete_secret'
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { routerId, fixes } = body as {
      routerId: string;
      fixes: Array<{ username: string; action: string }>;
    };

    if (!routerId) {
      return NextResponse.json({ success: false, error: 'Router ID is required' }, { status: 400 });
    }

    if (!Array.isArray(fixes) || fixes.length === 0) {
      return NextResponse.json({ success: false, error: 'Fixes array is required' }, { status: 400 });
    }

    const router = await prisma.router.findUnique({
      where: { id: routerId },
      select: { id: true, name: true, authMode: true },
    });

    if (!router) {
      return NextResponse.json({ success: false, error: 'Router not found' }, { status: 404 });
    }

    const results: Array<{ username: string; action: string; success: boolean; message: string }> = [];

    for (const fix of fixes) {
      try {
        const user = await prisma.pppoeUser.findUnique({
          where: { username: fix.username },
          select: {
            id: true, username: true, password: true, status: true,
            profileId: true, routerId: true,
            profile: { select: { id: true, groupName: true, name: true, mikrotikProfileName: true } },
          },
        });

        if (fix.action === 'delete_secret') {
          // Delete secret from MikroTik that doesn't exist in DB
          const r = await managePppSecret(routerId, 'delete', { username: fix.username });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
          continue;
        }

        if (!user) {
          results.push({ username: fix.username, action: fix.action, success: false, message: 'User not found in DB' });
          continue;
        }

        const mtProfile = user.profile ? await getMikrotikProfileName(user.profile.id) : null;
        const isIsolated = user.status === 'isolated' || user.status === 'blocked' || user.status === 'stop';

        if (fix.action === 'create_secret') {
          // Create missing secret in MikroTik
          const r = await managePppSecret(routerId, 'create', {
            username: user.username,
            password: user.password,
            profile: mtProfile || undefined,
            disabled: isIsolated,
          });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
        } else if (fix.action === 'update_password') {
          const r = await managePppSecret(routerId, 'update', {
            username: user.username,
            password: user.password,
          });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
        } else if (fix.action === 'update_profile') {
          const r = await managePppSecret(routerId, 'update', {
            username: user.username,
            profile: mtProfile || undefined,
          });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
        } else if (fix.action === 'update_status') {
          const r = await managePppSecret(routerId, isIsolated ? 'disable' : 'enable', {
            username: user.username,
            password: user.password,
            profile: mtProfile || undefined,
          });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
        } else if (fix.action === 'full_sync') {
          // Full sync: update password, profile, and status
          const r = await managePppSecret(routerId, 'create', {
            username: user.username,
            password: user.password,
            profile: mtProfile || undefined,
            disabled: isIsolated,
          });
          results.push({ username: fix.username, action: fix.action, success: r.success, message: r.message });
        } else {
          results.push({ username: fix.username, action: fix.action, success: false, message: `Unknown action: ${fix.action}` });
        }
      } catch (e: any) {
        results.push({ username: fix.username, action: fix.action, success: false, message: e?.message || 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Sync selesai. Berhasil: ${successCount}, Gagal: ${failedCount}`,
      results,
      stats: { success: successCount, failed: failedCount, total: results.length },
    });
  } catch (error: any) {
    console.error('Sync audit fix error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fix sync' }, { status: 500 });
  }
}
