'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, X } from 'lucide-react';

export const MAX_REPLY_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  /** Said once for each file that is turned away, with the reason. */
  onReject: (message: string) => void;
  disabled?: boolean;
}

/**
 * Photos (and PDFs) chosen for one reply. Only the choice happens here; the page uploads them when
 * the reply is sent, so a reply that fails to send leaves nothing on the server.
 */
export default function ReplyPhotoPicker({ files, onChange, onReject, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const add = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (next.length >= MAX_REPLY_FILES) {
        onReject(`Paling banyak ${MAX_REPLY_FILES} lampiran per balasan.`);
        break;
      }
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        onReject(`${file.name}: hanya foto atau PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        onReject(`${file.name}: lebih dari 10 MB.`);
        continue;
      }
      next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || files.length >= MAX_REPLY_FILES}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Camera size={16} aria-hidden="true" />
        Tambah foto
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />

      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} className="relative">
          {file.type === 'application/pdf' ? (
            <span className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-muted text-[10px] text-muted-foreground">
              <FileText size={18} className="text-red-500" aria-hidden="true" />
              PDF
            </span>
          ) : (
            <img src={previews[index]} alt={`Pratinjau ${file.name}`} className="h-16 w-16 rounded-lg border border-border object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange(files.filter((_, i) => i !== index))}
            disabled={disabled}
            aria-label={`Hapus ${file.name}`}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
