'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, FileText, Loader2, Lock, MessageSquare, Send, X } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import MessageAttachments, { hasVisibleText } from './MessageAttachments';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SenderType = 'CUSTOMER' | 'ADMIN' | 'TECHNICIAN' | 'SYSTEM';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Terbuka',
  IN_PROGRESS: 'Dikerjakan',
  WAITING_CUSTOMER: 'Menunggu pelanggan',
  RESOLVED: 'Selesai',
  CLOSED: 'Ditutup',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

export const SENDER_LABEL: Record<SenderType, string> = {
  CUSTOMER: 'Pelanggan',
  ADMIN: 'Admin',
  TECHNICIAN: 'Teknisi',
  SYSTEM: 'Sistem',
};

const BADGE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset';

// Status is the field people scan for, so it is the filled badge; priority stays outlined
// except URGENT, the one value that should pull the eye.
const STATUS_CLASS: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/30',
  WAITING_CUSTOMER: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  CLOSED: 'bg-muted text-muted-foreground ring-border',
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  LOW: 'text-muted-foreground ring-border',
  MEDIUM: 'text-sky-700 ring-sky-600/30 dark:text-sky-300 dark:ring-sky-400/30',
  HIGH: 'text-amber-800 ring-amber-600/40 dark:text-amber-300 dark:ring-amber-400/40',
  URGENT: 'bg-red-600 text-white ring-red-600 dark:bg-red-500 dark:ring-red-500',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const key = (status in STATUS_CLASS ? status : 'OPEN') as TicketStatus;
  return <span className={`${BADGE} ${STATUS_CLASS[key]}`}>{label ?? STATUS_LABEL[key] ?? status}</span>;
}

export function PriorityBadge({ priority, label, withPrefix }: { priority: string; label?: string; withPrefix?: boolean }) {
  const key = (priority in PRIORITY_CLASS ? priority : 'MEDIUM') as TicketPriority;
  const text = label ?? PRIORITY_LABEL[key] ?? priority;
  return <span className={`${BADGE} ${PRIORITY_CLASS[key]}`}>{withPrefix ? `Prioritas ${text.toLowerCase()}` : text}</span>;
}

/** The dot carries the colour the admin picked for the category; the text stays readable on any theme. */
export function CategoryBadge({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className={`${BADGE} text-foreground ring-border`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color || 'currentColor' }} aria-hidden="true" />
      {name}
    </span>
  );
}

export function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2 hover:opacity-80">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** A labelled value in the ticket side panel. Renders nothing when there is no value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card ${className}`}>
      {title && <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{title}</h2>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface ThreadMessage {
  id: string;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
  isInternal: boolean;
  attachments?: string | null;
}

interface ThreadProps {
  messages: ThreadMessage[];
  /** Whose screen this is; that side's messages sit on the right. */
  viewer: Exclude<SenderType, 'SYSTEM'>;
  /** The customer's original report, shown as the first message. */
  opening?: { name: string; text: string; attachments?: string | null; createdAt: string };
  loading?: boolean;
}

function dayKey(date: string) {
  return formatWIB(date, 'yyyy-MM-dd');
}

export function TicketThread({ messages, viewer, opening, loading }: ThreadProps) {
  const items: ThreadMessage[] = opening
    ? [{ id: '__opening', senderType: 'CUSTOMER', senderName: opening.name, message: opening.text, createdAt: opening.createdAt, isInternal: false, attachments: opening.attachments }, ...messages]
    : messages;

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat percakapan
      </div>
    );
  }

  let lastDay = '';
  return (
    <ol className="space-y-3" aria-label="Percakapan tiket">
      {items.map((msg) => {
        const day = dayKey(msg.createdAt);
        const separator = day !== lastDay ? (
          <li className="flex items-center gap-3 pt-2 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {formatWIB(msg.createdAt, 'EEEE, d MMMM yyyy')}
            <span className="h-px flex-1 bg-border" />
          </li>
        ) : null;
        lastDay = day;

        if (msg.senderType === 'SYSTEM') {
          return (
            <Fragment key={msg.id}>
              {separator}
              <li className="flex justify-center">
                <p className="max-w-[90%] rounded-md bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
                  {msg.message} <span className="whitespace-nowrap">· {formatWIB(msg.createdAt, 'HH:mm')}</span>
                </p>
              </li>
            </Fragment>
          );
        }

        const own = msg.senderType === viewer;
        const isOpening = msg.id === '__opening';
        const body = msg.message ?? '';
        const showText = body.trim() !== '' && hasVisibleText(body, msg.attachments);
        const tone = msg.isInternal
          ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
          : own
            ? 'border-primary/25 bg-primary/[0.07]'
            : 'border-border bg-card';

        return (
          <Fragment key={msg.id}>
            {separator}
            <li className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
              <article className={`w-fit min-w-0 max-w-[92%] rounded-xl border px-3.5 py-2.5 sm:max-w-[78%] ${tone}`}>
                <header className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${own ? 'justify-end text-right' : ''}`}>
                  <span className="font-semibold text-foreground">{msg.senderName}</span>
                  <span className="text-muted-foreground">{SENDER_LABEL[msg.senderType as SenderType] ?? msg.senderType}</span>
                  {isOpening && <span className="text-muted-foreground">· Laporan awal</span>}
                  {msg.isInternal && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                      <Lock className="h-3 w-3" aria-hidden="true" /> Catatan internal
                    </span>
                  )}
                </header>
                {showText && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{renderWithLinks(body)}</p>}
                <MessageAttachments attachments={msg.attachments} />
                <time dateTime={msg.createdAt} className={`mt-1.5 block text-[11px] text-muted-foreground ${own ? 'text-right' : ''}`}>
                  {formatWIB(msg.createdAt, 'HH:mm')}
                </time>
              </article>
            </li>
          </Fragment>
        );
      })}
      {items.length === 0 && (
        <li className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <MessageSquare className="h-6 w-6" aria-hidden="true" />
          Belum ada balasan. Pesan pertama akan tampil di sini.
        </li>
      )}
    </ol>
  );
}

export const MAX_REPLY_FILES = 5;

export interface ReplyPayload {
  text: string;
  files: File[];
  internal: boolean;
}

interface ComposerProps {
  /** Uploads and sends; resolves true when the reply was saved so the box can clear. */
  onSend: (payload: ReplyPayload) => Promise<boolean>;
  onReject: (message: string) => void;
  /** Staff only: lets the reply be saved as a note the customer never sees. */
  allowInternal?: boolean;
  allowPdf?: boolean;
  maxBytes?: number;
  /** Extra buttons in the toolbar; `insert` appends a line to the text. */
  tools?: (insert: (text: string) => void, busy: boolean) => ReactNode;
}

export function ReplyComposer({ onSend, onReject, allowInternal, allowPdf = true, maxBytes = 10 * 1024 * 1024, tools }: ComposerProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const limitMb = Math.round(maxBytes / (1024 * 1024));
  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (next.length >= MAX_REPLY_FILES) {
        onReject(`Paling banyak ${MAX_REPLY_FILES} lampiran per balasan.`);
        break;
      }
      const isPdf = file.type === 'application/pdf';
      if (!file.type.startsWith('image/') && !(allowPdf && isPdf)) {
        onReject(`${file.name}: ${allowPdf ? 'hanya foto atau PDF' : 'hanya foto'}.`);
        continue;
      }
      if (file.size > maxBytes) {
        onReject(`${file.name}: lebih dari ${limitMb} MB.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const insert = (line: string) => {
    setText((prev) => (prev.trim() ? `${prev}\n${line}` : line));
    textRef.current?.focus();
  };

  const canSend = !busy && (text.trim() !== '' || files.length > 0);
  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const ok = await onSend({ text: text.trim(), files, internal });
      if (ok) {
        setText('');
        setFiles([]);
        setInternal(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className={`rounded-xl border bg-card transition-colors ${internal ? 'border-amber-400 dark:border-amber-500/60' : 'border-border'}`}
    >
      {allowInternal && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
          <div role="radiogroup" aria-label="Jenis balasan" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
            {[
              { value: false, label: 'Balasan ke pelanggan' },
              { value: true, label: 'Catatan internal' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={internal === opt.value}
                onClick={() => setInternal(opt.value)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  internal === opt.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.value && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {opt.label}
              </button>
            ))}
          </div>
          {internal && <p className="text-xs text-amber-800 dark:text-amber-300">Hanya admin dan teknisi yang melihat catatan ini.</p>}
        </div>
      )}

      <label htmlFor="ticket-reply" className="sr-only">{internal ? 'Catatan internal' : 'Balasan'}</label>
      <textarea
        id="ticket-reply"
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}
        rows={3}
        disabled={busy}
        placeholder={internal ? 'Tulis catatan untuk tim...' : 'Tulis balasan...'}
        className="block w-full resize-y border-0 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-60"
      />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3 px-4 pb-3" aria-label="Lampiran yang akan dikirim">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative">
              {file.type === 'application/pdf' ? (
                <span className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-muted text-[10px] text-muted-foreground">
                  <FileText size={18} className="text-red-600 dark:text-red-400" aria-hidden="true" /> PDF
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[index]} alt={`Pratinjau ${file.name}`} className="h-16 w-16 rounded-lg border border-border object-cover" />
              )}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                disabled={busy}
                aria-label={`Hapus ${file.name}`}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
          <li className="self-center text-xs text-muted-foreground">Belum terkirim. Tekan Kirim.</li>
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || files.length >= MAX_REPLY_FILES}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Foto
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={allowPdf ? 'image/*,application/pdf' : 'image/*'}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => addFiles(e.target.files)}
        />
        {tools?.(insert, busy)}
        <span className="ml-auto hidden text-xs text-muted-foreground md:inline">Ctrl+Enter untuk kirim</span>
        <button
          type="submit"
          disabled={!canSend}
          className={`ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 md:ml-0 ${
            internal ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Mengirim' : internal ? 'Simpan catatan' : 'Kirim'}
        </button>
      </div>
    </form>
  );
}

/** Uploads each file through `upload` and returns the stored paths, failing on the first refusal. */
export async function uploadAll(files: File[], upload: (form: FormData) => Promise<{ url?: string; error?: string }>): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    const res = await upload(form);
    if (!res.url) throw new Error(res.error || `${file.name} gagal diunggah`);
    paths.push(res.url);
  }
  return paths;
}
