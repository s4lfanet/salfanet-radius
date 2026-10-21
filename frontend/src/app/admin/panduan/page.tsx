'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { GUIDES, SETUP_STEPS } from '@/lib/guides/admin-guides';
import { GuideBody } from '@/components/admin/PageGuide';

/**
 * Pusat Panduan: the first-time setup order, then the guide of every admin
 * page grouped like the sidebar. The same guides open from the Panduan
 * button on each page.
 */
export default function GuideHubPage() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (text: string) => text.toLowerCase().includes(q);
    const found = q
      ? GUIDES.filter((g) => match(g.title) || match(g.summary) || g.steps.some(match) || (g.notes ?? []).some(match))
      : GUIDES;
    const bySection = new Map<string, typeof GUIDES>();
    for (const g of found) bySection.set(g.section, [...(bySection.get(g.section) ?? []), g]);
    return [...bySection.entries()];
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pusat Panduan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Urutan menyiapkan Salfanet Radius dari awal, dan cara memakai setiap halaman. Panduan halaman yang sedang dibuka juga
          bisa dibuka dari tombol Panduan di bilah atas.
        </p>
      </div>

      <section aria-labelledby="setup-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="setup-heading" className="text-base font-semibold text-foreground">
          Mulai di sini: urutan setup
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kerjakan berurutan. Langkah berikutnya bergantung pada langkah sebelumnya, misalnya pelanggan baru bisa login setelah
          router dan FreeRADIUS tersambung.
        </p>
        <ol className="mt-4 space-y-4">
          {SETUP_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular-nums"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="pages-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="pages-heading" className="text-base font-semibold text-foreground">
              Panduan per halaman
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Klik judul untuk membuka langkah-langkahnya.</p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Cari panduan</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari, mis. isolir, voucher, router"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>

        {groups.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Tidak ada panduan yang cocok dengan &quot;{query}&quot;.
          </p>
        )}

        {groups.map(([section, guides]) => (
          <div key={section}>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{section}</h3>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {guides.map((g) => (
                <details key={g.path} className="group" open={query.trim().length > 0 && guides.length <= 3}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{g.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground group-open:hidden">{g.summary}</p>
                    </div>
                    <span aria-hidden className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="space-y-4 px-4 pb-4 pt-1">
                    <GuideBody guide={g} />
                    <Link
                      href={g.path}
                      className="inline-flex min-h-[40px] items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      Buka {g.title}
                    </Link>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
