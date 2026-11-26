'use client';

import { useEffect, useState } from 'react';
import { Gauge, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { CyberCard } from '@/components/cyberpunk';

const DEFAULT_SPEEDTEST_URL = 'https://openspeedtest.com/speedtest';

export default function CustomerSpeedTestPage() {
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Address set by the ISP in Pengaturan Perusahaan (their own, nearest server);
  // null until the setting is loaded so the page never opens the wrong server first.
  const [testUrl, setTestUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/company', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setTestUrl(d?.company?.speedtestUrl || DEFAULT_SPEEDTEST_URL); })
      .catch(() => { if (!cancelled) setTestUrl(DEFAULT_SPEEDTEST_URL); });
    return () => { cancelled = true; };
  }, []);

  const handleReload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="p-3 lg:p-6 w-full space-y-4">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div>
          <h1 className="text-lg lg:text-xl font-extrabold text-foreground flex items-center gap-2">
            <Gauge className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Speed Test
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cek kecepatan internet Anda saat ini
          </p>
        </div>
        <button
          onClick={handleReload}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-xl hover:bg-cyan-500/20 transition active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Muat Ulang
        </button>
      </div>

      <CyberCard className="p-0 overflow-hidden bg-card border-2 border-cyan-500/30 ">
        <div className="relative w-full" style={{ height: 'calc(100dvh - 220px)', minHeight: 480 }}>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card z-10">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600 dark:text-cyan-400" />
              <p className="text-xs text-muted-foreground">Memuat OpenSpeedTest...</p>
            </div>
          )}
          {testUrl && (
            <iframe
              key={`${reloadKey}-${testUrl}`}
              src={testUrl}
              title="Speed Test"
              className="w-full h-full border-0"
              onLoad={() => setLoading(false)}
              allow="fullscreen"
            />
          )}
        </div>
      </CyberCard>

      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-muted-foreground">
          Powered by OpenSpeedTest - hasil dapat bervariasi tergantung jaringan lokal Anda.
        </p>
        <a
          href={testUrl ?? DEFAULT_SPEEDTEST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 flex-shrink-0"
        >
          Buka di tab baru <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
