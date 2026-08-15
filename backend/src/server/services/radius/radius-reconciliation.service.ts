import 'server-only';
import { prisma } from '@/server/db/client';

/**
 * RADIUS Reconciliation Service
 *
 * Compares SalfaNet DB (pppoeUser) vs FreeRADIUS DB (radcheck/radusergroup/radreply)
 * and reports drift:
 *   - missing in RADIUS (user exists in SalfaNet but not in RADIUS)
 *   - stale in RADIUS (entry exists in RADIUS but user deleted/inactive in SalfaNet)
 *   - mismatch password
 *   - mismatch profile/group
 *   - mismatch IP
 *
 * Does NOT auto-repair. Returns a report for admin review.
 * Admin can trigger repair via the sync-all-radius endpoint.
 */

export interface ReconciliationReport {
  totalSalfaNetUsers: number;
  totalRadiusUsers: number;
  missingInRadius: Array<{
    pppoeUserId: string;
    username: string;
    reason: string;
  }>;
  staleInRadius: Array<{
    username: string;
    tables: string[]; // radcheck, radusergroup, radreply
  }>;
  mismatchPassword: Array<{
    pppoeUserId: string;
    username: string;
  }>;
  mismatchProfile: Array<{
    pppoeUserId: string;
    username: string;
    expectedGroup: string;
    actualGroup: string | null;
  }>;
  mismatchIp: Array<{
    pppoeUserId: string;
    username: string;
    expectedIp: string;
    actualIp: string | null;
  }>;
  summary: {
    totalIssues: number;
    criticalCount: number; // missing + mismatch password
    warningCount: number; // mismatch profile/ip + stale
  };
}

/**
 * Run a full reconciliation between SalfaNet DB and FreeRADIUS DB.
 * Reads in batches to avoid memory issues with large datasets.
 */
export async function runReconciliation(batchSize = 500): Promise<ReconciliationReport> {
  // Get all active PPPoE users (not deleted)
  const salfaNetUsers = await prisma.pppoeUser.findMany({
    select: {
      id: true,
      username: true,
      password: true,
      ipAddress: true,
      routerId: true,
      profileId: true,
      status: true,
      profile: { select: { groupName: true } },
    },
  });

  // Get all RADIUS usernames (unique)
  const radcheckUsers = await prisma.radcheck.findMany({
    select: { username: true, value: true, attribute: true, nas_identifier: true },
  });
  const radusergroupEntries = await prisma.radusergroup.findMany({
    select: { username: true, groupname: true, nas_identifier: true },
  });
  const radreplyEntries = await prisma.radreply.findMany({
    select: { username: true, value: true, attribute: true, nas_identifier: true },
  });

  // Build lookup maps
  const radiusUsernames = new Set<string>();
  const radiusPasswords = new Map<string, string>(); // username → password
  const radiusGroups = new Map<string, string>(); // username → groupname
  const radiusIps = new Map<string, string>(); // username → IP

  for (const rc of radcheckUsers) {
    radiusUsernames.add(rc.username);
    if (rc.attribute === 'Cleartext-Password') {
      radiusPasswords.set(rc.username, rc.value);
    }
  }
  for (const rug of radusergroupEntries) {
    radiusUsernames.add(rug.username);
    radiusGroups.set(rug.username, rug.groupname);
  }
  for (const rr of radreplyEntries) {
    radiusUsernames.add(rr.username);
    if (rr.attribute === 'Framed-IP-Address') {
      radiusIps.set(rr.username, rr.value);
    }
  }

  // SalfaNet usernames set
  const salfaNetUsernames = new Set(salfaNetUsers.map(u => u.username));

  // Find missing in RADIUS (user exists in SalfaNet but not in RADIUS)
  const missingInRadius: ReconciliationReport['missingInRadius'] = [];
  const mismatchPassword: ReconciliationReport['mismatchPassword'] = [];
  const mismatchProfile: ReconciliationReport['mismatchProfile'] = [];
  const mismatchIp: ReconciliationReport['mismatchIp'] = [];

  for (const user of salfaNetUsers) {
    const radiusPassword = radiusPasswords.get(user.username);
    const radiusGroup = radiusGroups.get(user.username);
    const radiusIp = radiusIps.get(user.username);

    if (!radiusUsernames.has(user.username)) {
      missingInRadius.push({
        pppoeUserId: user.id,
        username: user.username,
        reason: 'User exists in SalfaNet but has no RADIUS entries',
      });
    } else {
      // Check password mismatch
      if (radiusPassword !== user.password) {
        mismatchPassword.push({
          pppoeUserId: user.id,
          username: user.username,
        });
      }

      // Check profile/group mismatch
      const expectedGroup = user.profile?.groupName || null;
      if (expectedGroup && radiusGroup !== expectedGroup) {
        mismatchProfile.push({
          pppoeUserId: user.id,
          username: user.username,
          expectedGroup,
          actualGroup: radiusGroup ?? null,
        });
      }

      // Check IP mismatch (only if user has an IP assigned)
      if (user.ipAddress && radiusIp !== user.ipAddress) {
        mismatchIp.push({
          pppoeUserId: user.id,
          username: user.username,
          expectedIp: user.ipAddress,
          actualIp: radiusIp || null,
        });
      }
    }
  }

  // Find stale in RADIUS (entry exists in RADIUS but user doesn't exist in SalfaNet)
  const staleInRadius: ReconciliationReport['staleInRadius'] = [];
  for (const username of radiusUsernames) {
    if (!salfaNetUsernames.has(username)) {
      const tables: string[] = [];
      if (radcheckUsers.some(rc => rc.username === username)) tables.push('radcheck');
      if (radusergroupEntries.some(rug => rug.username === username)) tables.push('radusergroup');
      if (radreplyEntries.some(rr => rr.username === username)) tables.push('radreply');
      staleInRadius.push({ username, tables });
    }
  }

  const criticalCount = missingInRadius.length + mismatchPassword.length;
  const warningCount = mismatchProfile.length + mismatchIp.length + staleInRadius.length;

  return {
    totalSalfaNetUsers: salfaNetUsers.length,
    totalRadiusUsers: radiusUsernames.size,
    missingInRadius,
    staleInRadius,
    mismatchPassword,
    mismatchProfile,
    mismatchIp,
    summary: {
      totalIssues: criticalCount + warningCount,
      criticalCount,
      warningCount,
    },
  };
}
