'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiAdmin } from '@/lib/api';

interface OpticalField {
  label: string;
  value: string;
}

/** Reads the optical module of one PON port on request: it takes a Telnet session on the OLT. */
export function PonOptical({ oltId, slot, port }: { oltId: string; slot: number; port: number }) {
  const [fields, setFields] = useState<OpticalField[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFields(null);
    setError(null);
  }, [oltId, slot, port]);

  const read = () => {
    setLoading(true);
    setError(null);
    apiAdmin<{ success?: boolean; error?: string; fields?: OpticalField[] }>(`/api/olt/${oltId}/pon-optical?slot=${slot}&port=${port}`)
      .then((response) => {
        if (response.success) setFields(response.fields ?? []);
        else setError(response.error ?? 'Modul optik tidak terbaca');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Modul optik tidak terbaca'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={read}
        disabled={loading}
        className="inline-flex min-h-9 items-center gap-1.5 rounded border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Membaca...' : 'Baca modul optik'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {fields && fields.length === 0 && <p className="mt-2 text-xs text-muted-foreground">OLT tidak memberi data modul untuk port ini.</p>}
      {fields && fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="truncate font-mono text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
