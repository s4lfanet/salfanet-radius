/**
 * Attachments of a ticket message: a JSON array of upload paths in `ticketMessage.attachments`.
 *
 * The paths are rendered as links and images in the admin, technician and customer views, so only
 * what the three upload routes can have produced is accepted. A customer could otherwise store an
 * arbitrary URL (or a `javascript:` one) that opens in a staff member's browser.
 */

/** Body of a message that carries only photos. The column is not nullable, so it needs some text. */
export const PHOTO_ONLY_MESSAGE = '📷 Foto dikirim';

export const MAX_MESSAGE_ATTACHMENTS = 5;

const UPLOADED_PATH = /^\/uploads\/tickets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:jpe?g|png|webp|gif|pdf)$/i;

/**
 * The upload paths in `input` (an array, or its JSON text), or null when anything in it is not an
 * upload path. A rejected list fails the request instead of being trimmed, since silently dropping
 * a photo is the bug this exists to prevent.
 */
export function parseAttachmentInput(input: unknown): string[] | null {
  if (input === undefined || input === null || input === '') return [];

  let list: unknown = input;
  if (typeof input === 'string') {
    try {
      list = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length > MAX_MESSAGE_ATTACHMENTS) return null;

  const paths: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string' || !UPLOADED_PATH.test(item)) return null;
    if (!paths.includes(item)) paths.push(item);
  }
  return paths;
}

/** What is stored in the message: the text, or the photo-only text when there is none. Empty when neither exists. */
export function messageText(message: unknown, attachmentCount: number): string {
  if (typeof message === 'string' && message.trim()) return message;
  return attachmentCount > 0 ? PHOTO_ONLY_MESSAGE : '';
}

export function encodeAttachments(paths: string[]): string | null {
  return paths.length > 0 ? JSON.stringify(paths) : null;
}
