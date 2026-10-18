'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound } from 'lucide-react';

const PORTALS = {
  admin: { label: 'Admin & staf kantor', path: '/admin/login' },
  technician: { label: 'Teknisi', path: '/technician/login' },
  collector: { label: 'Kolektor', path: '/collector/login' },
  agent: { label: 'Agen voucher', path: '/agent' },
  customer: { label: 'Pelanggan', path: '/customer/login' },
} as const;

export type PortalKey = keyof typeof PORTALS;

/**
 * Login addresses to hand to new staff, technicians or collectors. Built
 * from the address this panel is open on, since every installation runs
 * on its own domain.
 */
export function LoginLinks({ portals, title = 'Alamat login' }: { portals: PortalKey[]; title?: string }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API needs HTTPS; fall back to a selection copy.
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  if (!origin) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
        <KeyRound className="w-3.5 h-3.5 text-primary" /> {title}
      </p>
      <div className="divide-y divide-border">
        {portals.map((key) => {
          const { label, path } = PORTALS[key];
          const url = `${origin}${path}`;
          return (
            <div key={key} className="flex items-center gap-2 py-1.5 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-xs font-mono text-foreground break-all">{url}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(key, url)}
                aria-label={`Salin alamat login ${label}`}
                className="shrink-0 inline-flex items-center justify-center gap-1 min-h-[36px] px-2.5 rounded-md border border-border text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copied === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copied === key ? 'Disalin' : 'Salin'}</span>
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Buka halaman login ${label}`}
                className="shrink-0 inline-flex items-center justify-center min-h-[36px] px-2.5 rounded-md border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
