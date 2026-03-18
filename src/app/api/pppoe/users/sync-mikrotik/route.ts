import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { RouterOSAPI } from 'node-routeros';
import { generateUniqueReferralCode } from '@/server/services/referral.service';

interface MikrotikPPPoESecret {
  '.id': string;
  name: string;
  password: string;
  service: string;
  profile: string;
  'caller-id'?: string;
  'remote-address'?: string;
  comment?: string;
  disabled?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  stats: {
    total: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  imported: Array<{
    username: string;
    profile: string;
  }>;
  skipped: Array<{
    username: string;
    reason: string;
  }>;
  errors: Array<{
    username: string;
    error: string;
  }>;
}

// GET - Preview PPPoE secrets from MikroTik (without importing)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const routerId = searchParams.get('routerId');

    if (!routerId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Router ID is required' 
      }, { status: 400 });
    }

    // Get router info
    const router = await prisma.router.findUnique({
      where: { id: routerId },
    });

    if (!router) {
      return NextResponse.json({ 
        success: false, 
        error: 'Router not found' 
      }, { status: 404 });
    }

    // Connect to MikroTik — try plaintext port first, fall back to SSL port
    const apiHost = router.ipAddress || router.nasname;
    const apiPortPlain = router.port || 8728;
    const apiPortSsl = (router as any).apiPort || 8729;

    let api: any;
    try {
      api = new RouterOSAPI({ host: apiHost, port: apiPortPlain, user: router.username, password: router.password, timeout: 10 });
      await api.connect();
    } catch {
      // Plaintext port failed — try SSL
      api = new RouterOSAPI({ host: apiHost, port: apiPortSsl, user: router.username, password: router.password, timeout: 15, tls: { rejectUnauthorized: false } } as any);
      await api.connect();
    }

    // Get PPPoE secrets
    const secrets = await api.write('/ppp/secret/print') as MikrotikPPPoESecret[];

    await api.close();

    // Get existing users from database
    const existingUsers = await prisma.pppoeUser.findMany({
      select: { username: true },
    });
    const existingUsernames = new Set(existingUsers.map(u => u.username));

    // Categorize secrets
    const newSecrets = secrets.filter(s => !existingUsernames.has(s.name));
    const existingSecrets = secrets.filter(s => existingUsernames.has(s.name));

    return NextResponse.json({
      success: true,
      router: {
        id: router.id,
        name: router.name,
        ipAddress: router.ipAddress || router.nasname,
      },
      data: {
        total: secrets.length,
        new: newSecrets.length,
        existing: existingSecrets.length,
        secrets: secrets.map(s => ({
          username: s.name,
          profile: s.profile,
          service: s.service,
          remoteAddress: s['remote-address'] || null,
          callerId: s['caller-id'] || null,
          comment: s.comment || null,
          disabled: s.disabled === 'true',
          isNew: !existingUsernames.has(s.name),
        })),
      },
    });
  } catch (error: any) {
    console.error('Preview MikroTik PPPoE secrets error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch PPPoE secrets from MikroTik'
    }, { status: 500 });
  }
}

// POST - Import/Sync PPPoE secrets from MikroTik to database
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { 
      routerId, 
      profileId, 
      selectedUsernames, // Optional: only import selected users
      syncToRadius = true,
      defaultPhone = '08',
    } = body;

    if (!routerId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Router ID is required' 
      }, { status: 400 });
    }

    if (!profileId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Profile ID is required for mapping' 
      }, { status: 400 });
    }

    // Get router info
    const router = await prisma.router.findUnique({
      where: { id: routerId },
    });

    if (!router) {
      return NextResponse.json({ 
        success: false, 
        error: 'Router not found' 
      }, { status: 404 });
    }

    // Get profile info
    const profile = await prisma.pppoeProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json({ 
        success: false, 
        error: 'Profile not found' 
      }, { status: 404 });
    }

    // Connect to MikroTik — try plaintext port first, fall back to SSL port
    const apiHost2 = router.ipAddress || router.nasname;
    const apiPortPlain2 = router.port || 8728;
    const apiPortSsl2 = (router as any).apiPort || 8729;

    let api: any;
    try {
      api = new RouterOSAPI({ host: apiHost2, port: apiPortPlain2, user: router.username, password: router.password, timeout: 10 });
      await api.connect();
    } catch {
      // Plaintext port failed — try SSL
      api = new RouterOSAPI({ host: apiHost2, port: apiPortSsl2, user: router.username, password: router.password, timeout: 15, tls: { rejectUnauthorized: false } } as any);
      await api.connect();
    }

    // Get PPPoE secrets
    const secrets = await api.write('/ppp/secret/print') as MikrotikPPPoESecret[];

    await api.close();

    // Filter by selected usernames if provided
    const secretsToImport = selectedUsernames?.length > 0
      ? secrets.filter(s => selectedUsernames.includes(s.name))
      : secrets;

    // Get existing users from database
    const existingUsers = await prisma.pppoeUser.findMany({
      select: { username: true },
    });
    const existingUsernames = new Set(existingUsers.map(u => u.username));

    const result: SyncResult = {
      success: true,
      message: '',
      stats: {
        total: secretsToImport.length,
        imported: 0,
        skipped: 0,
        failed: 0,
      },
      imported: [],
      skipped: [],
      errors: [],
    };

    // Calculate expiry date based on profile validity
    const calculateExpiry = () => {
      const now = new Date();
      if (profile.validityUnit === 'MONTHS') {
        now.setMonth(now.getMonth() + profile.validityValue);
      } else {
        now.setDate(now.getDate() + profile.validityValue);
      }
      return now;
    };

    // Process each secret
    for (const secret of secretsToImport) {
      // Skip if user already exists
      if (existingUsernames.has(secret.name)) {
        result.skipped.push({
          username: secret.name,
          reason: 'Already exists in database',
        });
        result.stats.skipped++;
        continue;
      }

      // Skip disabled users
      if (secret.disabled === 'true') {
        result.skipped.push({
          username: secret.name,
          reason: 'Disabled in MikroTik',
        });
        result.stats.skipped++;
        continue;
      }

      try {
        // Create user in database
        const userId = crypto.randomUUID();
        const expiredAt = calculateExpiry();

        await prisma.pppoeUser.create({
          data: {
            id: userId,
            username: secret.name,
            password: secret.password,
            profileId: profileId,
            routerId: routerId,
            name: secret.comment || secret.name,
            phone: defaultPhone,
            email: null,
            address: null,
            latitude: null,
            longitude: null,
            ipAddress: secret['remote-address'] || null,
            macAddress: secret['caller-id'] || null,
            comment: `Imported from MikroTik (${router.name}) - Original profile: ${secret.profile}`,
            status: 'active',
            expiredAt: expiredAt,
            syncedToRadius: false,
            referralCode: await generateUniqueReferralCode(),
          },
        });

        // Sync to RADIUS if enabled
        if (syncToRadius) {
          try {
            // Add to radcheck
            await prisma.radcheck.create({
              data: {
                username: secret.name,
                attribute: 'Cleartext-Password',
                op: ':=',
                value: secret.password,
              },
            });

            // Add to radusergroup
            await prisma.radusergroup.create({
              data: {
                username: secret.name,
                groupname: profile.groupName,
                priority: 0,
              },
            });

            // NOTE: NAS-IP-Address NOT stored in radcheck (breaks auth in VPN/NAT setups)

            // Add Framed-IP-Address if user has static IP
            if (secret['remote-address']) {
              await prisma.radreply.create({
                data: {
                  username: secret.name,
                  attribute: 'Framed-IP-Address',
                  op: ':=',
                  value: secret['remote-address'],
                },
              });
            }

            // Update syncedToRadius flag
            await prisma.pppoeUser.update({
              where: { id: userId },
              data: { syncedToRadius: true },
            });
          } catch (radiusError: any) {
            console.error(`Failed to sync ${secret.name} to RADIUS:`, radiusError);
            // Continue without failing - user is created but not synced
          }
        }

        result.imported.push({
          username: secret.name,
          profile: profile.name,
        });
        result.stats.imported++;
      } catch (error: any) {
        console.error(`Failed to import ${secret.name}:`, error);
        result.errors.push({
          username: secret.name,
          error: error.message || 'Unknown error',
        });
        result.stats.failed++;
      }
    }

    result.message = `Sync completed. Imported: ${result.stats.imported}, Skipped: ${result.stats.skipped}, Failed: ${result.stats.failed}`;

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sync MikroTik PPPoE secrets error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to sync PPPoE secrets from MikroTik'
    }, { status: 500 });
  }
}
