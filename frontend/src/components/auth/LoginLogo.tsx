'use client';

import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';

interface LoginLogoProps {
  src: string | null;
  alt: string;
  /** Shown in the same tile when the company has not uploaded a logo. */
  fallbackIcon: LucideIcon;
}

/**
 * Company logo above every portal's login form. Uploaded logos are drawn for
 * white paper, so the tile stays solid white in dark mode as well: a themed or
 * translucent tile turned dark logos grey or invisible on some portals.
 */
export function LoginLogo({ src, alt, fallbackIcon: Icon }: LoginLogoProps) {
  return (
    <div className="flex justify-center mb-5">
      {src ? (
        <div className="w-24 h-24 p-2 rounded-xl bg-white border border-border flex items-center justify-center overflow-hidden">
          <Image unoptimized src={src} alt={alt} width={220} height={110} className="max-h-full max-w-full w-auto h-auto object-contain" />
        </div>
      ) : (
        <div className="w-24 h-24 rounded-xl bg-primary text-primary-foreground flex items-center justify-center" aria-hidden="true">
          <Icon className="w-10 h-10" />
        </div>
      )}
    </div>
  );
}
