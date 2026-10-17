'use client';

import { useEffect, useState } from 'react';

type Target = 'customer' | 'admin';
interface Release { available: boolean; url?: string; size?: number; updatedAt?: string }

let pending: Promise<Record<string, Release>> | null = null;

function load(): Promise<Record<string, Release>> {
  pending ??= fetch('/api/public/apk-releases', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.releases as Record<string, Release>) ?? {})
    .catch(() => ({}));
  return pending;
}

/**
 * The published Android app for a login page: its download URL (with a
 * content id, so the CDN never serves an older copy) or null when none
 * has been uploaded yet, in which case the page shows no download button.
 */
export function useApkRelease(target: Target): Release | null {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((all) => {
      if (alive) setRelease(all[target]?.available ? all[target] : null);
    });
    return () => {
      alive = false;
    };
  }, [target]);
  return release;
}
