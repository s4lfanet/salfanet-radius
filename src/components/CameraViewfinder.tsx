'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { X, SwitchCamera, Circle, Camera } from 'lucide-react';

interface CameraViewfinderProps {
  /** Called with the captured File when user takes a photo */
  onCapture: (file: File) => void;
  /** Called when user closes the viewfinder */
  onClose: () => void;
}

/**
 * Inline live camera viewfinder.
 * - HTTPS / localhost: uses getUserMedia → live video viewfinder in browser
 * - HTTP (no HTTPS): falls back to native camera via capture="environment" input
 *   which opens the native camera app directly on mobile
 */
export function CameraViewfinder({ onCapture, onClose }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCaptureRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  // true when getUserMedia is unavailable (HTTP context) → use native capture input
  const [useNativeCapture, setUseNativeCapture] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (facing: 'environment' | 'user') => {
    // HTTP context: getUserMedia not available → use native capture
    if (!navigator.mediaDevices?.getUserMedia) {
      setUseNativeCapture(true);
      return;
    }
    setError('');
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // getUserMedia failed — silently fallback to native capture
      setUseNativeCapture(true);
    }
  }, [stopStream]);

  // Start camera on mount
  useEffect(() => {
    startStream(facingMode);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When native capture mode is active, auto-click the hidden input
  useEffect(() => {
    if (useNativeCapture) {
      // Small delay to ensure DOM is ready
      const t = setTimeout(() => nativeCaptureRef.current?.click(), 50);
      return () => clearTimeout(t);
    }
  }, [useNativeCapture]);

  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startStream(next);
  }, [facingMode, startStream]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    stopStream();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.85);
  }, [stopStream, onCapture, onClose]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  const handleNativeFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }
    onCapture(file);
    onClose();
  }, [onCapture, onClose]);

  // --- Native capture fallback (HTTP) ---
  if (useNativeCapture) {
    return (
      <div className="relative rounded-lg overflow-hidden border-2 border-[#00f7ff]/60 bg-black">
        {/* Hidden native camera input — auto-clicked on mount */}
        <input
          ref={nativeCaptureRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleNativeFile}
        />
        <div className="flex flex-col items-center justify-center gap-3 h-32 text-white/80 text-sm">
          <Camera className="w-8 h-8 text-[#00f7ff]" />
          <p className="text-xs text-center px-4">Menunggu kamera terbuka...</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => nativeCaptureRef.current?.click()}
              className="px-4 py-1.5 text-xs rounded-full bg-[#00f7ff]/20 border border-[#00f7ff]/50 text-[#00f7ff] hover:bg-[#00f7ff]/30 transition-colors"
            >
              Buka Kamera
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-1.5 text-xs rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-lg border-2 border-dashed border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-3 text-center text-xs text-red-600 dark:text-red-400">
        <p>{error}</p>
        <div className="flex justify-center gap-2 mt-2">
          <button type="button" onClick={() => startStream(facingMode)} className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors">Coba Lagi</button>
          <button type="button" onClick={handleClose} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors">Batal</button>
        </div>
      </div>
    );
  }

  // --- Live viewfinder (HTTPS / localhost) ---
  return (
    <div className="relative rounded-lg overflow-hidden border-2 border-[#00f7ff]/60 bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-6 py-3 bg-gradient-to-t from-black/80 to-transparent">
        <button type="button" onClick={handleClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" title="Tutup">
          <X className="w-5 h-5" />
        </button>
        <button type="button" onClick={takePhoto} className="w-14 h-14 flex items-center justify-center rounded-full bg-white border-4 border-[#00f7ff] hover:bg-[#00f7ff]/20 transition-colors" title="Ambil Foto">
          <Circle className="w-7 h-7 text-[#00f7ff] fill-[#00f7ff]" />
        </button>
        <button type="button" onClick={flipCamera} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors" title="Ganti Kamera">
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
