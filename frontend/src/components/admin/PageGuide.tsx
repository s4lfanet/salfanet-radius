'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BookOpen, X } from 'lucide-react';
import { guideFor, type PageGuide as Guide } from '@/lib/guides/admin-guides';

/** The guide body, shared by the side panel and the guide hub. */
export function GuideBody({ guide, onNavigate }: { guide: Guide; onNavigate?: () => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-foreground">{guide.summary}</p>

      <section>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">Cara pakai</h3>
        <ol className="space-y-2.5">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary tabular-nums"
              >
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {guide.notes && guide.notes.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3">
          <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Perhatikan</h3>
          <ul className="space-y-1.5 list-disc pl-4 marker:text-amber-500">
            {guide.notes.map((n, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      {guide.related && guide.related.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Halaman terkait</h3>
          <div className="flex flex-wrap gap-2">
            {guide.related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={onNavigate}
                className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {r.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Panduan button for the admin top bar: opens the guide for the page that
 * is open, in a side panel.
 */
export function PageGuideButton() {
  const pathname = usePathname() || '/admin';
  const [open, setOpen] = useState(false);
  const guide = guideFor(pathname);
  const close = () => setOpen(false);

  // The hub already shows every guide.
  if (pathname === '/admin/panduan') return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Panduan halaman ini"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-transparent px-2 sm:px-2.5 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Panduan</span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-[9999] flex w-full flex-col border-l border-border bg-background shadow-xl outline-none sm:max-w-md data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-primary">Panduan</p>
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                {guide ? guide.title : 'Halaman ini'}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Tutup panduan"
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {guide ? (
              <GuideBody guide={guide} onNavigate={close} />
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Belum ada panduan khusus untuk halaman ini. Urutan setup dan panduan halaman lain ada di Pusat Panduan.
              </p>
            )}
          </div>

          <div className="border-t border-border px-4 py-3 sm:px-5">
            <Link
              href="/admin/panduan"
              onClick={close}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Urutan setup &amp; semua panduan
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
