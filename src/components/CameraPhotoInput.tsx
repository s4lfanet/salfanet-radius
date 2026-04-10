'use client';

import { useId, useState } from 'react';
import { Camera, ImageIcon, X, MapPin, Loader2 } from 'lucide-react';

interface CameraPhotoInputProps {
  photoUrl: string;
  onRemove: () => void;
  /** Called when user selects a file – handles upload & state update. Returns URL on success or null on failure. */
  onUploadFile: (file: File) => Promise<string | null>;
  uploading: boolean;
  /** Called after GPS coords are captured; use to fill parent lat/lng state */
  onGpsCapture?: (lat: number, lng: number) => void;
  hint?: string;
  /** Tailwind h-* class for preview image height, e.g. "h-28" */
  previewClassName?: string;
  /** 'dark': cyberpunk/daftar theme | 'light': admin/modal theme (default) */
  theme?: 'dark' | 'light';
}

export function CameraPhotoInput({
  photoUrl,
  onRemove,
  onUploadFile,
  uploading,
  onGpsCapture,
  hint = 'JPG/PNG/WebP, maks. 5MB',
  previewClassName = 'h-28',
  theme = 'light',
}: CameraPhotoInputProps) {
  // useId generates a stable unique ID per component instance; prevents
  // htmlFor collisions when multiple CameraPhotoInput are on the same page.
  const uid = useId();
  const galleryId = `gallery-${uid}`;
  const cameraId = `camera-${uid}`;

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const captureGps = () => {
    if (!('geolocation' in navigator)) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGps({ lat, lng });
        onGpsCapture?.(lat, lng);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = await onUploadFile(file);
    if (url) captureGps();
  };

  const handleRemove = () => {
    setGps(null);
    onRemove();
  };

  const isDark = theme === 'dark';

  const gpsBadgeClass = isDark
    ? 'text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30'
    : 'text-green-600 dark:text-[#00ff88] bg-green-50 dark:bg-[#00ff88]/10 border border-green-100 dark:border-[#00ff88]/30';

  // Shared hidden inputs — placed outside conditional branches so the IDs
  // always exist in the DOM. Using sr-only (not display:none) ensures iOS
  // Safari honours the capture="environment" attribute when triggered via
  // their associated <label> elements.
  const hiddenInputs = (
    <>
      {/* Gallery input – no capture attribute → opens photo library */}
      <input
        id={galleryId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
        disabled={uploading}
      />
      {/* Camera input – capture="environment" → opens rear camera directly */}
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFile}
        disabled={uploading}
      />
    </>
  );

  if (photoUrl) {
    return (
      <div className="space-y-1.5">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="Preview"
            className={`w-full ${previewClassName} object-cover rounded-xl border-2 ${
              isDark ? 'border-[#00ff88]/50' : 'border-border dark:border-[#bc13fe]/30'
            }`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 z-10"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {/* Using <label> so iOS Safari honours the file input directly */}
            <label
              htmlFor={uploading ? undefined : galleryId}
              className={`flex items-center gap-1 px-2 py-0.5 text-[9px] bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-sm ${uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
            >
              <ImageIcon className="w-2.5 h-2.5" /> Ganti
            </label>
            <label
              htmlFor={uploading ? undefined : cameraId}
              className={`flex items-center gap-1 px-2 py-0.5 text-[9px] bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-sm ${uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
            >
              <Camera className="w-2.5 h-2.5" /> Kamera
            </label>
          </div>
        </div>

        {gpsLoading && (
          <div className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 ${gpsBadgeClass}`}>
            <Loader2 className="w-3 h-3 animate-spin" /> Mengambil lokasi GPS...
          </div>
        )}
        {gps && !gpsLoading && (
          <a
            href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 hover:underline ${gpsBadgeClass}`}
          >
            <MapPin className="w-3 h-3" />
            📍 {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · Lihat di Maps ↗
          </a>
        )}

        {hiddenInputs}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {uploading ? (
        <div className={`flex items-center justify-center w-full h-20 rounded-xl border-2 border-dashed ${
          isDark ? 'border-[#00f7ff]/40 bg-[#0a0520]' : 'border-border dark:border-[#bc13fe]/30 bg-muted/30 dark:bg-[#0a0520]/30'
        }`}>
          <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-[#00f7ff]' : 'text-primary dark:text-[#00f7ff]'}`} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Gallery button */}
          <label
            htmlFor={galleryId}
            className={`flex flex-col items-center justify-center gap-1 w-full py-3 rounded-xl border-2 border-dashed transition-all text-[11px] cursor-pointer ${
              isDark
                ? 'border-[#bc13fe]/40 text-[#e0d0ff]/60 bg-[#0a0520] hover:border-[#bc13fe]/70 hover:text-[#e0d0ff]/90'
                : 'border-border dark:border-[#bc13fe]/40 text-muted-foreground dark:text-[#e0d0ff]/60 hover:bg-muted dark:hover:bg-[#bc13fe]/10'
            }`}
          >
            <ImageIcon className="w-5 h-5" />
            Galeri
          </label>
          {/* Camera button — label directly triggers input with capture="environment" */}
          <label
            htmlFor={cameraId}
            className={`flex flex-col items-center justify-center gap-1 w-full py-3 rounded-xl border-2 border-dashed transition-all text-[11px] cursor-pointer ${
              isDark
                ? 'border-[#00f7ff]/40 text-[#00f7ff]/70 bg-[#0a0520] hover:border-[#00f7ff]/70 hover:text-[#00f7ff]'
                : 'border-primary/40 dark:border-[#00f7ff]/40 text-primary/70 dark:text-[#00f7ff]/70 hover:bg-primary/5 dark:hover:bg-[#00f7ff]/10'
            }`}
          >
            <Camera className="w-5 h-5" />
            Kamera HP
          </label>
        </div>
      )}
      {hint && (
        <p className={`text-[9px] ${isDark ? 'text-[#e0d0ff]/40' : 'text-muted-foreground'}`}>{hint}</p>
      )}
      {hiddenInputs}
    </div>
  );
}
