'use client';

import { Bell, BellOff, ShieldAlert, ShieldCheck } from 'lucide-react';
import { usePushNotification } from '@/hooks/usePushNotification';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface PushNotificationToggleProps {
  compact?: boolean;
}

export function PushNotificationToggle({ compact = false }: PushNotificationToggleProps) {
  const { t } = useTranslation();
  const { isSupported, isSubscribed, permission, isLoading, error, subscribe, unsubscribe } = usePushNotification();

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await subscribe();
      return;
    }
    await unsubscribe();
  };

  // Compact single-row version for sidebar
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/15 bg-cyan-500/5 mb-2">
        <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          {isSubscribed
            ? <Bell className="w-3.5 h-3.5 text-cyan-400" />
            : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
        </span>
        <span className="flex-1 text-[11px] font-bold text-cyan-300 tracking-wide truncate">Push Notif</span>
        {permission === 'granted'
          ? <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          : <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        <Switch
          checked={isSubscribed}
          onCheckedChange={(checked) => { void handleToggle(checked); }}
          disabled={!isSupported || isLoading}
          aria-label={t('customerPush.toggleAria')}
          className="scale-75 flex-shrink-0"
        />
      </div>
    );
  }

  // Full version for dashboard
  return (
    <Card className="mb-4 border-cyan-400/20 bg-cyan-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-2">
              {isSubscribed ? (
                <Bell className="h-4 w-4 text-cyan-300" />
              ) : (
                <BellOff className="h-4 w-4 text-cyan-300" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                {t('customerPush.label')}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {isSubscribed ? t('customerPush.enabled') : t('customerPush.disabled')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {isSupported ? t('customerPush.description') : t('customerPush.unsupported')}
              </p>
            </div>
          </div>

          <Switch
            checked={isSubscribed}
            onCheckedChange={(checked) => { void handleToggle(checked); }}
            disabled={!isSupported || isLoading}
            aria-label={t('customerPush.toggleAria')}
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/15 bg-background/50 px-3 py-2 text-[11px] text-muted-foreground">
          {permission === 'granted' ? (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span>
            {permission === 'granted'
              ? t('customerPush.permissionGranted')
              : permission === 'denied'
                ? t('customerPush.permissionDenied')
                : t('customerPush.permissionDefault')}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200">
            {error}
          </div>
        )}

        {!isSubscribed && isSupported && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { void subscribe(); }}
            disabled={isLoading}
          >
            {isLoading ? t('customerPush.processing') : t('customerPush.enableAction')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
