import { FileText, Paperclip } from 'lucide-react';

/** Parses ticket.attachments (JSON array of upload URLs) and shows them as thumbnails. */
export function parseTicketAttachments(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
  } catch {
    return [];
  }
}

export default function TicketAttachments({ attachments }: { attachments?: string | null }) {
  const files = parseTicketAttachments(attachments);
  if (files.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Paperclip size={14} className="text-cyan-400" />
        <p className="text-xs text-muted-foreground">Lampiran ({files.length})</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {files.map((url, idx) =>
          url.toLowerCase().endsWith('.pdf') ? (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 aspect-square rounded-lg border border-border bg-background hover:border-cyan-500/40"
            >
              <FileText size={22} className="text-red-400" />
              <span className="text-[10px] text-muted-foreground">PDF {idx + 1}</span>
            </a>
          ) : (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square">
              <img
                src={url}
                alt={`Lampiran ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-cover rounded-lg border border-border hover:border-cyan-500/40"
              />
            </a>
          ),
        )}
      </div>
    </div>
  );
}
