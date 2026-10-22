'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Shared pieces for the collector portal, following
 * src/app/collector/DESIGN.md (the admin app's direction): blue #2563EB as the
 * one accent, 1px-bordered cards without shadows, radius 16 / 12 / pill for
 * status only, and the tinted rounded icon box as the repeated motif.
 */

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

// Status shades: -700 on light, -400 on dark (contrast holds on both).
const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-blue-700 dark:text-blue-400',
  green: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-red-700 dark:text-red-400',
  slate: 'text-slate-600 dark:text-slate-300',
};
const TONE_BG: Record<Tone, string> = {
  blue: 'bg-blue-600/10',
  green: 'bg-emerald-600/10',
  amber: 'bg-amber-500/10', // 15% left amber-700 text at 4.47:1, under AA
  red: 'bg-red-600/10',
  slate: 'bg-slate-500/10',
};

export const toneText = (t: Tone) => TONE_TEXT[t];

export const ui = {
  card: 'rounded-2xl border border-border bg-card',
  input:
    'w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-blue-600/60',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-border bg-card text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
  iconBtn:
    'inline-flex items-center justify-center h-11 w-11 rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
};

/** Segmented filter chip: selected one filled blue, the rest bordered. */
export function chipClass(active: boolean) {
  return cn(
    'shrink-0 h-10 px-3.5 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
    active ? 'bg-blue-600 text-white' : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* On phones the top bar already carries the page title. */}
        <h2 className="hidden lg:block text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="lg:mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The motif: a tinted rounded square holding a meaningful icon. */
export function IconBox({ tone = 'blue', children, size = 'md' }: { tone?: Tone; children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-xl', TONE_BG[tone], TONE_TEXT[tone], size === 'md' ? 'h-10 w-10' : 'h-8 w-8')}>
      {children}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE_BG[tone], TONE_TEXT[tone])}>{children}</span>;
}

/** Customer status as the panel shows it everywhere in the portal. */
export function customerStatus(status: string): { tone: Tone; label: string } {
  if (status === 'active') return { tone: 'green', label: 'Aktif' };
  if (status === 'isolated' || status === 'suspended') return { tone: 'red', label: 'Isolir' };
  if (status === 'stop' || status === 'stopped') return { tone: 'slate', label: 'Berhenti' };
  return { tone: 'slate', label: status };
}

export function LoadingState({ label = 'Memuat data...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={cn(ui.card, 'flex flex-col items-center gap-3 p-6 text-center')} role="alert">
      <IconBox tone="red"><AlertTriangle className="h-5 w-5" /></IconBox>
      <div>
        <p className="text-sm font-semibold text-foreground">Data gagal dimuat</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={ui.btnSecondary}>
          <RefreshCw className="h-4 w-4" /> Coba lagi
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className={cn(ui.card, 'flex flex-col items-center gap-3 px-6 py-10 text-center')}>
      <IconBox tone="slate">{icon}</IconBox>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
