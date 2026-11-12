import { FileText } from 'lucide-react';
import { parseTicketAttachments } from './TicketAttachments';

/** Text the server stores for a message that carries only photos (old rows lack the camera mark). */
const PHOTO_ONLY = /^(?:📷\s*)?Foto dikirim$/i;

/** False for a photo-only message: the photos say it, the placeholder text would only repeat it. */
export function hasVisibleText(message: string, attachments?: string | null): boolean {
  return !(PHOTO_ONLY.test(message.trim()) && parseTicketAttachments(attachments).length > 0);
}

/** Photos and PDFs sent with one message. Each opens in a new tab at full size. */
export default function MessageAttachments({ attachments }: { attachments?: string | null }) {
  const files = parseTicketAttachments(attachments);
  if (files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((url, index) => {
        const isPdf = url.toLowerCase().endsWith('.pdf');
        const label = isPdf ? `Buka PDF ${index + 1}` : `Buka foto ${index + 1}`;
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="block h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isPdf ? (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                <FileText size={22} className="text-red-500" />
                PDF {index + 1}
              </span>
            ) : (
              <img src={url} alt={`Foto ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
            )}
          </a>
        );
      })}
    </div>
  );
}
