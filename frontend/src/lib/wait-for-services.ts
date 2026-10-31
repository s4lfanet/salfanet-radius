/**
 * After the server restarts its own services (Settings, Company: timezone),
 * wait until the backend and the frontend both answer again before touching
 * the page. Reloading on a fixed timer landed on nginx's "502 Bad Gateway"
 * whenever a restart was still under way.
 */
export type RestartWait = 'ready' | 'timeout';

// The backend's health route, and a NextAuth route that only the frontend serves.
const BACKEND_PROBE = '/api/health';
const FRONTEND_PROBE = '/api/auth/csrf';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves 'ready' once both answer twice in a row after both have been seen
 * down (the restart really happened), or after `settleMs` if the restart was
 * too quick to catch. Resolves 'timeout' if they are not back by `timeoutMs`.
 */
export async function waitForServicesBack({
  timeoutMs = 120_000,
  settleMs = 45_000,
  intervalMs = 1000,
}: { timeoutMs?: number; settleMs?: number; intervalMs?: number } = {}): Promise<RestartWait> {
  const start = Date.now();
  let backendWasDown = false;
  let frontendWasDown = false;
  let healthyInARow = 0;

  while (Date.now() - start < timeoutMs) {
    const [backend, frontend] = await Promise.all([alive(BACKEND_PROBE), alive(FRONTEND_PROBE)]);
    if (!backend) backendWasDown = true;
    if (!frontend) frontendWasDown = true;

    healthyInARow = backend && frontend ? healthyInARow + 1 : 0;
    const restarted = (backendWasDown && frontendWasDown) || Date.now() - start >= settleMs;
    if (healthyInARow >= 2 && restarted) return 'ready';

    await sleep(intervalMs);
  }
  return 'timeout';
}
