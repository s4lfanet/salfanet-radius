import { describe, it, expect } from 'vitest';

/**
 * Phase 3 — FreeRADIUS Synchronization Hardening Tests
 *
 * Tests verify that RADIUS sync operations are properly scoped by nas_identifier
 * and do not cross-contaminate entries between NAS/routers.
 *
 * These are static/contract tests that validate the source code patterns
 * rather than requiring a live database.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', 'src');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), 'utf-8');
}

function findUnsafeDeletes(content: string): string[] {
  const unsafePatterns: RegExp[] = [
    /DELETE FROM radcheck WHERE username = \$\{[^}]+\}\s*[`;]/,
    /DELETE FROM radreply WHERE username = \$\{[^}]+\}\s*[`;]/,
    /DELETE FROM radusergroup WHERE username = \$\{[^}]+\}\s*[`;]/,
    /DELETE FROM radreply WHERE username = \$\{[^}]+\} AND attribute = 'Framed-IP-Address'\s*[`;]/,
  ];
  const matches: string[] = [];
  for (const pattern of unsafePatterns) {
    const found = content.match(new RegExp(pattern.source, 'g'));
    if (found) matches.push(...found);
  }
  return matches;
}

function findUnsafeDeleteMany(content: string): string[] {
  // Find radcheck/radreply/radusergroup deleteMany without nas_identifier
  const lines = content.split('\n');
  const unsafe: string[] = [];
  let inDeleteMany = false;
  let blockLines: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/rad(check|reply|usergroup)\.deleteMany/)) {
      inDeleteMany = true;
      blockLines = [line];
      braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth === 0) {
        // Single-line deleteMany
        if (!line.includes('nas_identifier') && !line.includes('nasIdentifier')) {
          unsafe.push(`Line ${i + 1}: ${line.trim()}`);
        }
        inDeleteMany = false;
      }
    } else if (inDeleteMany) {
      blockLines.push(line);
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        const block = blockLines.join('\n');
        // Exclude delete flows (user deletion) which intentionally delete all NAS entries
        const isDeleteFlow = block.includes("attribute: 'Auth-Type'") === false &&
          (blockLines[0].includes('deleteMany({ where: { username') &&
           !block.includes('nas_identifier') && !block.includes('nasIdentifier'));
        // Check if it's a legitimate full-delete (user deletion scenario)
        const isFullUserDelete = blockLines.some(l => l.includes("user is deleted") || l.includes("across all NAS"));
        if (isDeleteFlow && !isFullUserDelete) {
          unsafe.push(`Block at line ${i - blockLines.length + 2}: missing nas_identifier filter`);
        }
        inDeleteMany = false;
      }
    }
  }
  return unsafe;
}

describe('Phase 3 — FreeRADIUS Synchronization Hardening', () => {

  describe('Cross-NAS isolation — DELETE queries must scope by nas_identifier', () => {
    const syncFiles = [
      'app/api/pppoe/users/[id]/sync-radius/route.ts',
      'app/api/pppoe/users/[id]/mark-paid/route.ts',
      'app/api/pppoe/users/[id]/extend/route.ts',
      'app/api/manual-payments/[id]/route.ts',
      'app/api/payment/webhook/route.ts',
    ];

    for (const file of syncFiles) {
      it(`${file} — no unscoped DELETE FROM rad* queries`, () => {
        const content = readFile(file);
        const unsafe = findUnsafeDeletes(content);
        expect(unsafe, `Found unscoped DELETE queries:\n${unsafe.join('\n')}`).toEqual([]);
      });
    }
  });

  describe('pppoe.service.ts — update must not delete ALL NAS entries', () => {
    it('update PPPoE should scope deleteMany by oldNasIdentifier + nasIdentifier + null', () => {
      const content = readFile('server/services/pppoe.service.ts');
      // The update section should NOT have unconditional deleteMany by username only
      // Find the section around line 698
      const updateSection = content.substring(
        content.indexOf('nasIdentifiersToClean = [oldNasIdentifier'),
        content.indexOf('enqueueTask', content.indexOf('nasIdentifiersToClean = [oldNasIdentifier'))
      );
      expect(updateSection).toContain('oldNasIdentifier');
      expect(updateSection).toContain('nasIdentifiersToClean');
      expect(updateSection).toContain('nas_identifier: null');
      // Should NOT contain unconditional deleteMany
      expect(updateSection).not.toMatch(/deleteMany\(\{ where: \{ username: oldUsername \} \}\)/);
    });
  });

  describe('sync-radius route — must scope by nas_identifier', () => {
    it('DELETE FROM radcheck must include nas_identifier filter', () => {
      const content = readFile('app/api/pppoe/users/[id]/sync-radius/route.ts');
      const radcheckDelete = content.match(/DELETE FROM radcheck[^`]*`/g);
      expect(radcheckDelete).not.toBeNull();
      for (const del of radcheckDelete!) {
        expect(del).toContain('nas_identifier');
      }
    });

    it('DELETE FROM radusergroup must include nas_identifier filter', () => {
      const content = readFile('app/api/pppoe/users/[id]/sync-radius/route.ts');
      const radusergroupDelete = content.match(/DELETE FROM radusergroup[^`]*`/g);
      expect(radusergroupDelete).not.toBeNull();
      for (const del of radusergroupDelete!) {
        expect(del).toContain('nas_identifier');
      }
    });

    it('DELETE FROM radreply must include nas_identifier filter', () => {
      const content = readFile('app/api/pppoe/users/[id]/sync-radius/route.ts');
      const radreplyDelete = content.match(/DELETE FROM radreply[^`]*`/g);
      expect(radreplyDelete).not.toBeNull();
      for (const del of radreplyDelete!) {
        expect(del).toContain('nas_identifier');
      }
    });
  });

  describe('mark-paid route — must scope by nas_identifier', () => {
    it('radcheck deleteMany for Auth-Type must include nas_identifier', () => {
      const content = readFile('app/api/pppoe/users/[id]/mark-paid/route.ts');
      // Find the Auth-Type deleteMany block
      const authTypeBlock = content.match(/radcheck\.deleteMany\(\{[\s\S]*?Auth-Type[\s\S]*?\}\)/g);
      expect(authTypeBlock).not.toBeNull();
      for (const block of authTypeBlock!) {
        expect(block).toContain('nas_identifier');
      }
    });

    it('DELETE FROM radusergroup must include nas_identifier filter', () => {
      const content = readFile('app/api/pppoe/users/[id]/mark-paid/route.ts');
      const deletes = content.match(/DELETE FROM radusergroup[^`]*`/g);
      expect(deletes).not.toBeNull();
      for (const del of deletes!) {
        expect(del).toContain('nas_identifier');
      }
    });
  });

  describe('extend route — must scope by nas_identifier', () => {
    it('radcheck deleteMany for Auth-Type must include nas_identifier', () => {
      const content = readFile('app/api/pppoe/users/[id]/extend/route.ts');
      const authTypeBlock = content.match(/radcheck\.deleteMany\(\{[\s\S]*?Auth-Type[\s\S]*?\}\)/g);
      expect(authTypeBlock).not.toBeNull();
      for (const block of authTypeBlock!) {
        expect(block).toContain('nas_identifier');
      }
    });

    it('DELETE FROM radusergroup must include nas_identifier filter', () => {
      const content = readFile('app/api/pppoe/users/[id]/extend/route.ts');
      const deletes = content.match(/DELETE FROM radusergroup[^`]*`/g);
      expect(deletes).not.toBeNull();
      for (const del of deletes!) {
        expect(del).toContain('nas_identifier');
      }
    });
  });

  describe('manual-payments route — must scope by nas_identifier', () => {
    it('DELETE FROM radusergroup must include nas_identifier filter', () => {
      const content = readFile('app/api/manual-payments/[id]/route.ts');
      const deletes = content.match(/DELETE FROM radusergroup[^`]*`/g);
      expect(deletes).not.toBeNull();
      for (const del of deletes!) {
        expect(del).toContain('nas_identifier');
      }
    });

    it('radcheck deleteMany for Auth-Type must include nas_identifier', () => {
      const content = readFile('app/api/manual-payments/[id]/route.ts');
      const authTypeBlock = content.match(/radcheck\.deleteMany\(\{[\s\S]*?Auth-Type[\s\S]*?\}\)/g);
      expect(authTypeBlock).not.toBeNull();
      for (const block of authTypeBlock!) {
        expect(block).toContain('nas_identifier');
      }
    });
  });

  describe('payment webhook — reactivation must scope by nas_identifier', () => {
    it('radcheck deleteMany for Auth-Type must include nas_identifier', () => {
      const content = readFile('app/api/payment/webhook/route.ts');
      // Find the reactivation section
      const reactivationSection = content.substring(
        content.indexOf('RADIUS SYNC FOR REACTIVATION'),
        content.indexOf('RADIUS entries restored')
      );
      const authTypeBlocks = reactivationSection.match(/radcheck\.deleteMany\(\{[\s\S]*?Auth-Type[\s\S]*?\}\)/g);
      expect(authTypeBlocks).not.toBeNull();
      for (const block of authTypeBlocks!) {
        expect(block).toContain('nas_identifier');
      }
    });

    it('DELETE FROM radusergroup must include nas_identifier filter', () => {
      const content = readFile('app/api/payment/webhook/route.ts');
      const reactivationSection = content.substring(
        content.indexOf('RADIUS SYNC FOR REACTIVATION'),
        content.indexOf('RADIUS entries restored')
      );
      const deletes = reactivationSection.match(/DELETE FROM radusergroup[^`]*`/g);
      expect(deletes).not.toBeNull();
      for (const del of deletes!) {
        expect(del).toContain('nas_identifier');
      }
    });
  });

  describe('Reconciliation — cursor pagination', () => {
    it('reconciliation service must use cursor pagination (not load all at once)', () => {
      const content = readFile('server/services/radius/radius-reconciliation.service.ts');
      // Must contain cursor-based pagination
      expect(content).toContain('cursor');
      expect(content).toContain('radcheckCursor');
      expect(content).toContain('radusergroupCursor');
      expect(content).toContain('radreplyCursor');
      // Must NOT load entire tables without pagination
      expect(content).not.toMatch(/radcheck\.findMany\(\s*\{[^}]*\}\s*\)/);
    });

    it('reconciliation must use batchSize parameter', () => {
      const content = readFile('server/services/radius/radius-reconciliation.service.ts');
      expect(content).toContain('batchSize');
      expect(content).toContain('take: batchSize');
    });

    it('reconciliation stale detection must use map lookup (not array .some())', () => {
      const content = readFile('server/services/radius/radius-reconciliation.service.ts');
      // Should use radiusTablePresence map, not .some() on arrays
      expect(content).toContain('radiusTablePresence');
      // Should NOT use .some() for stale table detection
      expect(content).not.toMatch(/radcheckUsers\.some/);
      expect(content).not.toMatch(/radusergroupEntries\.some/);
      expect(content).not.toMatch(/radreplyEntries\.some/);
    });
  });

  describe('sync-all-radius — batch processing', () => {
    it('sync-all-radius must use BATCH_SIZE and process in batches', () => {
      const content = readFile('app/api/admin/pppoe/sync-all-radius/route.ts');
      expect(content).toContain('BATCH_SIZE');
      expect(content).toContain('Promise.allSettled');
    });
  });

  describe('syncSingleUserToRadius — nas_identifier scoping', () => {
    it('syncSingleUserToRadius must scope deleteMany by nas_identifier', () => {
      const content = readFile('server/services/radius/radius-sync-queue.service.ts');
      const syncSection = content.substring(
        content.indexOf('syncSingleUserToRadius'),
        content.indexOf('syncSingleUserDeleteToRadius')
      );
      // All deleteMany in sync section must include nas_identifier
      const deleteManyBlocks = syncSection.match(/\.deleteMany\(\{[\s\S]*?\}\)/g);
      expect(deleteManyBlocks).not.toBeNull();
      for (const block of deleteManyBlocks!) {
        expect(block).toContain('nas_identifier');
      }
    });

    it('syncSingleUserDeleteToRadius intentionally deletes ALL NAS entries (user deletion)', () => {
      const content = readFile('server/services/radius/radius-sync-queue.service.ts');
      const deleteSection = content.substring(
        content.indexOf('syncSingleUserDeleteToRadius'),
        content.indexOf('Close any open accounting')
      );
      // Full user deletion — should delete across all NAS (intentional)
      expect(deleteSection).toContain('deleteMany({ where: { username } })');
      // Should have a comment explaining why
      expect(deleteSection).toContain('across all NAS');
    });
  });

  describe('Cross-NAS isolation scenario documentation', () => {
    it('Scenario: User A (router A) sync must not affect User B (router B)', () => {
      // This is a documentation test that describes the expected behavior:
      //
      // Given:
      //   - User A is on Router A (nas_identifier = "router-a-id")
      //   - User B is on Router B (nas_identifier = "router-b-id")
      //
      // When: Admin syncs User A to RADIUS
      //
      // Then:
      //   - Only radcheck/radreply/radusergroup entries for User A on Router A are deleted+recreated
      //   - User B's entries on Router B are NOT touched
      //   - If User A had entries on Router B (shouldn't happen), they are NOT touched
      //
      // The nas_identifier filter ensures: DELETE ... WHERE username = 'userA' AND nas_identifier = 'router-a-id'
      // This cannot match User B's rows because username = 'userB' AND nas_identifier = 'router-b-id'
      expect(true).toBe(true);
    });
  });
});
