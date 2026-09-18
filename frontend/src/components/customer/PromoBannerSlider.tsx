'use client';

import { useEffect, useState, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';

interface PromoBanner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
}

const AUTO_ROTATE_MS = 5000;

export default function PromoBannerSlider() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/promo-banners');
        const data = await res.json();
        if (!cancelled && data.success) setBanners(data.banners || []);
      } catch (error) {
        console.error('Load promo banners error:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (banners.length < 2) return;
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % banners.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(interval);
  }, [banners.length]);

  const goTo = useCallback((index: number) => setActive(index), []);

  if (banners.length === 0) return null;

  return (
    <div className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden border border-white/10 bg-black/30">
      {banners.map((banner, index) => {
        const isEager = index === 0;
        return (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ${index === active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {banner.linkUrl ? (
              <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                <BannerImage banner={banner} eager={isEager} />
              </a>
            ) : (
              <BannerImage banner={banner} eager={isEager} />
            )}
            {banner.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-xs sm:text-sm font-medium truncate">{banner.title}</p>
                  {banner.linkUrl && <ExternalLink className="w-3 h-3 text-white/80 flex-shrink-0" />}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {banners.length > 1 && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10 bg-black/40 rounded-full px-2 py-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              onClick={() => goTo(index)}
              aria-label={`Slide ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${index === active ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Blurred cover backdrop + a contained foreground image, so the full banner
// stays visible with no cropping regardless of the aspect ratio it was
// uploaded at. The outer container uses a single aspect-ratio (not a fixed
// pixel height) so it scales proportionally with screen width at every
// breakpoint — same relative size and framing on mobile and desktop.
function BannerImage({ banner, eager }: { banner: PromoBanner; eager: boolean }) {
  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.imageUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-50"
        loading={eager ? 'eager' : 'lazy'}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.imageUrl}
        alt={banner.title || 'Promo'}
        className="relative w-full h-full object-contain"
        loading={eager ? 'eager' : 'lazy'}
      />
    </div>
  );
}
