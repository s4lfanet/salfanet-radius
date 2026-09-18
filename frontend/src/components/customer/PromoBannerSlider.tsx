'use client';

import { useEffect, useState, useCallback } from 'react';

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
    <div className="relative w-full h-36 sm:h-44 md:h-52 lg:h-60 rounded-2xl overflow-hidden border border-white/10 bg-black/30">
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
                <p className="text-white text-xs sm:text-sm font-medium truncate">{banner.title}</p>
              </div>
            )}
          </div>
        );
      })}

      {banners.length > 1 && (
        <div className="absolute bottom-2 right-3 flex items-center gap-1.5 z-10">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              onClick={() => goTo(index)}
              aria-label={`Slide ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${index === active ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Blurred cover backdrop + a contained foreground image, so the full banner
// is always visible with no cropping regardless of the aspect ratio the
// admin uploaded it at or which breakpoint's fixed-height box it lands in —
// object-cover alone would crop a differently-shaped region at each height.
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
