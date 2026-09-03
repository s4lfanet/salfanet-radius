'use client';

import { useState } from 'react';
import { Gauge, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { CyberCard } from '@/components/cyberpunk';

export default function CustomerSpeedTestPage() {
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="p-3 lg:p-6 w-full space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg lg:text-xl font-extrabold text-foreground flex items-center gap-2">
            <Gauge className="w-5 h-5 text-cyan-400" />
            Speed Test
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cek kecepatan internet Anda saat ini
          </p>
        </div>
        <button
          onClick={handleReload}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl hover:bg-cyan-500/20 transition-all active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Muat Ulang
        </button>
      </div>

      <CyberCard className="p-0 overflow-hidden bg-card/80 backdrop-blur-xl border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(0,247,255,0.15)]">
        <div className="relative w-full" style={{ height: 'calc(100dvh - 220px)', minHeight: 480 }}>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card z-10">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs text-muted-foreground">Memuat OpenSpeedTest...</p>
            </div>
          )}
          <iframe
            key={reloadKey}
            src="https://openspeedtest.com/speedtest.html"
            title="OpenSpeedTest"
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            allow="fullscreen"
          />
        </div>
      </CyberCard>

      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-muted-foreground">
          Powered by OpenSpeedTest — hasil dapat bervariasi tergantung jaringan lokal Anda.
        </p>
        <a
          href="https://openspeedtest.com/speedtest.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 flex-shrink-0"
        >
          Buka di tab baru <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
