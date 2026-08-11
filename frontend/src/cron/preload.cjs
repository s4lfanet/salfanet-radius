/**
 * preload.cjs — Mock 'server-only' before tsx loads any TypeScript file.
 *
 * This is required because Next.js server files use `import 'server-only'`
 * as a guard against client bundle inclusion. When running via standalone
 * tsx (outside Next.js), that guard throws. This preload patches the require
 * cache so 'server-only' becomes a no-op.
 *
 * Usage: node --require ./src/cron/preload.cjs <tsx-register> src/cron/runner.ts
 * (see runner-wrapper.cjs)
 */
'use strict';

try {
  const id = require.resolve('server-only');
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports: {},
    parent: null,
    children: [],
    paths: [],
  };
} catch (_e) {
  // 'server-only' not installed (shouldn't happen) — silently ignore
}
