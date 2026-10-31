/**
 * After the server restarts its own services (Settings, Company: timezone),
 * wait until the backend and the frontend both answer again before touching
 * the page. Reloading on a fixed timer landed on nginx's "502 Bad Gateway"
 * whenever a restart was still under way.
 *
 * The browser logs every failed request ("Failed to load resource ... 502")
 * and a script cannot hide that, so the wait stays quiet while the restart is
 * expected to be running and only starts asking afterwards. Normally the first
 * answers are already good and nothing is logged at all.
 */
export type RestartWait = 'ready' | 'timeout';

// The backend's health route (it reports how long it has been up), and a
// NextAuth route that only the frontend serves.
const BACKEND_PROBE = '/api/health';
const FRONTEND_PROBE = '/api/auth/csrf';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ask(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function backendUptime(): Promise<{ up: boolean; uptimeSeconds: number | null }> {
  const res = await ask(BACKEND_PROBE);
  if (!res) return { up: false, uptimeSeconds: null };
  try {
    const body = await res.json();
    return { up: true, uptimeSeconds: typeof body.uptimeSeconds === 'number' ? body.uptimeSeconds : null };
  } catch {
    return { up: true, uptimeSeconds: null };
  }
}

/**
 * Call right after the restart request was accepted.
 *
 * Quiet for `quietMs` (the script waits ~2 s, then the apps are down for about
 * 3 s), then asks every `intervalMs`. Ready when both answer twice in a row and
 * the backend's uptime shows it started after the request, so a still-old
 * process answering before the restart began is not mistaken for a finished
 * restart. If the uptime cannot settle it, `settleMs` is the fallback. Gives up
 * with 'timeout' after `timeoutMs`.
 */
export async function waitForServicesBack({
  quietMs = 8000,
  intervalMs = 1500,
  settleMs = 30_000,
  timeoutMs = 120_000,
}: { quietMs?: number; intervalMs?: number; settleMs?: number; timeoutMs?: number } = {}): Promise<RestartWait> {
  const start = Date.now();
  await sleep(quietMs);

  let healthyInARow = 0;
  while (Date.now() - start < timeoutMs) {
    const [backend, frontend] = await Promise.all([backendUptime(), ask(FRONTEND_PROBE)]);
    const elapsed = Date.now() - start;

    const restarted =
      (backend.uptimeSeconds !== null && backend.uptimeSeconds * 1000 < elapsed) || elapsed >= settleMs;
    healthyInARow = backend.up && frontend ? healthyInARow + 1 : 0;
    if (healthyInARow >= 2 && restarted) return 'ready';

    await sleep(intervalMs);
  }
  return 'timeout';
}
