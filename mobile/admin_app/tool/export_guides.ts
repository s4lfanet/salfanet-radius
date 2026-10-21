/**
 * Copies the admin panel guides (frontend/src/lib/guides/admin-guides.ts)
 * into the admin app as assets/guides.json, so both use one text.
 *
 * Run after editing the guides, from mobile/admin_app:
 *   npx tsx tool/export_guides.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, SETUP_STEPS } from '../../../frontend/src/lib/guides/admin-guides';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'guides.json');
writeFileSync(out, JSON.stringify({ setup: SETUP_STEPS, guides: GUIDES }, null, 1) + '\n');
console.log(`wrote ${GUIDES.length} guides and ${SETUP_STEPS.length} setup steps to ${out}`);
