'use client';

import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

export default function CustomerOfflinePage() {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-[calc(100vh-8rem)] px-6 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.24),transparent_42%),linear-gradient(180deg,#020912_0%,#03131d_100%)]" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center rounded-[32px] border border-cyan-400/20 bg-slate-950/80 px-8 py-12 text-center shadow-[0_30px_100px_rgba(6,182,212,0.14)] backdrop-blur-xl">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10">
          <CloudOff className="h-10 w-10 text-cyan-300" />
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">
          {t('customerPush.offlineLabel')}
        </p>
        <h1 className="max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {t('customerPush.offlineTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
          {t('customerPush.offlineDescription')}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            {t('customerPush.retry')}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.href = '/customer'}>
            <Wifi className="h-4 w-4" />
            {t('customerPush.backToDashboard')}
          </Button>
        </div>
      </div>
    </div>
  );
}