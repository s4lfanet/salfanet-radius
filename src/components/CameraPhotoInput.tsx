'use client';

import { useId, useRef, useState, useCallback, useEffect } from 'react';
import { Camera, ImageIcon, X, MapPin, Loader2, SwitchCamera, Circle } from 'lucide-react';

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
  const uid = useId();
  const galleryId = `gallery-${uid}`;
  const captureId = `capture-${uid}`;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const captureGps = useCallback(() => {
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
  }, [onGpsCapture]);

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

  const handleCaptureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = await onUploadFile(file);
    if (url) captureGps();
  };

  // --- Camera API (getUserMedia with fallback to capture="environment" for HTTP) ---
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCameraError('');
  }, []);

  const startCamera = useCallback(async (facing: 'environment' | 'user' = facingMode) => {
    // On HTTP (no HTTPS), getUserMedia is unavailable — fall back to native camera via capture
    if (!navigator.mediaDevices?.getUserMedia) {
      captureRef.current?.click();
      return;
    }
    setCameraError('');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Buka pengaturan browser → izinkan akses kamera.'
        : err?.name === 'NotFoundError'
          ? 'Kamera tidak ditemukan di perangkat ini.'
          : `Gagal membuka kamera: ${err?.message || err}`;
      setCameraError(msg);
    }
  }, [facingMode]);

  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraOpen) startCamera(next);
  }, [facingMode, cameraOpen, startCamera]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    stopCamera();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await onUploadFile(file);
      if (url) captureGps();
    }, 'image/jpeg', 0.85);
  }, [stopCamera, onUploadFile, captureGps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const isDark = theme === 'dark';

  const gpsBadgeClass = isDark
    ? 'text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30'
    : 'text-green-600 dark:text-[#00ff88] bg-green-50 dark:bg-[#00ff88]/10 border border-green-100 dark:border-[#00ff88]/30';

  const galleryInput = (
    <input
      id={galleryId}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={handleFile}
      disabled={uploading}
    />
  );

  // Fallback capture input for HTTP contexts where getUserMedia is unavailable
  const captureInput = (
    <input
      ref={captureRef}
      id={captureId}
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      onChange={handleCaptureFile}
      disabled={uploading}
    />
  );

  const hiddenCanvas = <canvas ref={canvasRef} className="hidden" />;

  // --- Camera viewfinder ---
  if (cameraOpen) {
    return (
      <div className="space-y-1.5">
        <div className="relative rounded-xl overflow-hidden border-2 border-[#00f7ff]/60 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-48 object-cover"
          />
          {/* Controls */}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-6 py-3 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={stopCamera}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors"
              title="Tutup Kamera"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={takePhoto}
              className="w-14 h-14 flex items-center justify-center rounded-full bg-white border-4 border-[#00f7ff] hover:bg-[#00f7ff]/20 transition-colors"
              title="Ambil Foto"
            >
              <Circle className="w-7 h-7 text-[#00f7ff] fill-[#00f7ff]" />
            </button>
            <button
              type="button"
              onClick={flipCamera}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
              title="Ganti Kamera Depan/Belakang"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </div>
        </div>
        {hiddenCanvas}
      </div>
    );
  }

  // --- Camera error ---
  if (cameraError) {
    return (
      <div className="space-y-1.5">
        <div className={`rounded-xl border-2 border-dashed p-3 text-center text-xs ${
          isDark ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400'
        }`}>
          <p>{cameraError}</p>
          <div className="flex justify-center gap-2 mt-2">
            <button type="button" onClick={() => { setCameraError(''); startCamera(); }} className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors">
              Coba Lagi
            </button>
            <button type="button" onClick={() => setCameraError('')} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors">
              Batal
            </button>
          </div>
        </div>
        {galleryInput}
        {captureInput}
        {hiddenCanvas}
      </div>
    );
  }

  // --- Photo preview ---
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
            <label
              htmlFor={uploading ? undefined : galleryId}
              className={`flex items-center gap-1 px-2 py-0.5 text-[9px] bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-sm ${uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
            >
              <ImageIcon className="w-2.5 h-2.5" /> Ganti
            </label>
            <button
              type="button"
              onClick={() => startCamera()}
              disabled={uploading}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-sm disabled:opacity-50"
            >
              <Camera className="w-2.5 h-2.5" /> Kamera
            </button>
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

        {galleryInput}
        {captureInput}
        {hiddenCanvas}
      </div>
    );
  }

  // --- Empty state: Galeri + Kamera buttons ---
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
          {/* Gallery — opens file picker */}
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
          {/* Camera — opens live camera via getUserMedia */}
          <button
            type="button"
            onClick={() => startCamera()}
            className={`flex flex-col items-center justify-center gap-1 w-full py-3 rounded-xl border-2 border-dashed transition-all text-[11px] cursor-pointer ${
              isDark
                ? 'border-[#00f7ff]/40 text-[#00f7ff]/70 bg-[#0a0520] hover:border-[#00f7ff]/70 hover:text-[#00f7ff]'
                : 'border-primary/40 dark:border-[#00f7ff]/40 text-primary/70 dark:text-[#00f7ff]/70 hover:bg-primary/5 dark:hover:bg-[#00f7ff]/10'
            }`}
          >
            <Camera className="w-5 h-5" />
            Kamera
          </button>
        </div>
      )}
      {hint && (
        <p className={`text-[9px] ${isDark ? 'text-[#e0d0ff]/40' : 'text-muted-foreground'}`}>{hint}</p>
      )}
      {galleryInput}
      {captureInput}
      {hiddenCanvas}
    </div>
  );
}
