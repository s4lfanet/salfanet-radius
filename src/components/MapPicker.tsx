'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, MapPin, Navigation } from 'lucide-react';
import { showError } from '@/lib/sweetalert';

interface MapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function MapPicker({
  isOpen,
  onClose,
  onSelect,
  initialLat = -7.0712854057077745,
  initialLng = 108.04477186751905,
}: MapPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [basemap, setBasemap] = useState<'street' | 'satellite'>('street');
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && initialLat && initialLng) {
      setPosition([initialLat, initialLng]);
    }
  }, [isOpen, initialLat, initialLng]);

  // Initialize map when dialog opens
  useEffect(() => {
    if (!isOpen || !isMounted || !mapContainerRef.current) return;

    let isCancelled = false;

    const initMap = async () => {
      // Dynamic import Leaflet
      const L = (await import('leaflet')).default;

      // Import CSS via link tag
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Fix default marker icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (isCancelled || !mapContainerRef.current) return;

      // Check if map already exists
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Create map
      const center: [number, number] = position || [initialLat, initialLng];
      const map = L.map(mapContainerRef.current).setView(center, 15);
      mapRef.current = map;

      // Add tile layer based on basemap selection
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      });

      if (basemap === 'street') {
        streetLayer.addTo(map);
      } else {
        satelliteLayer.addTo(map);
      }

      // Add marker if position exists
      if (position) {
        markerRef.current = L.marker(position).addTo(map);
      }

      // Handle map click
      map.on('click', (e: any) => {
        const newPos: [number, number] = [e.latlng.lat, e.latlng.lng];
        setPosition(newPos);

        // Update or create marker
        if (markerRef.current) {
          markerRef.current.setLatLng(newPos);
        } else {
          markerRef.current = L.marker(newPos).addTo(map);
        }
      });

      setMapLoaded(true);
    };

    initMap();

    return () => {
      isCancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      setMapLoaded(false);
    };
  }, [isOpen, isMounted]);

  // Handle basemap change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const L = require('leaflet');

    // Remove existing tile layers
    mapRef.current.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) {
        mapRef.current.removeLayer(layer);
      }
    });

    // Add new tile layer
    if (basemap === 'street') {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    } else {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      }).addTo(mapRef.current);
    }
  }, [basemap, mapLoaded]);

  const handleConfirm = () => {
    if (position) {
      onSelect(position[0], position[1]);
      onClose();
    }
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newPos);

          if (mapRef.current) {
            mapRef.current.flyTo(newPos, 17);

            // Update or create marker
            const L = require('leaflet');
            if (markerRef.current) {
              markerRef.current.setLatLng(newPos);
            } else {
              markerRef.current = L.marker(newPos).addTo(mapRef.current);
            }
          }
        },
        (err) => {
          console.error('GPS Error:', err);
          showError('Gagal mendapatkan lokasi GPS. Pastikan izin lokasi diaktifkan.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      showError('Browser tidak mendukung GPS');
    }
  };

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 10001 }}>
      <div className="bg-gradient-to-br from-slate-900 to-[#1a0f35] rounded-xl sm:rounded-2xl shadow-[0_0_50px_rgba(188,19,254,0.3)] border-2 border-[#bc13fe]/30 w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-[#bc13fe]/20 bg-gradient-to-r from-[#bc13fe]/10 to-[#00f7ff]/10 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#00f7ff]/20 rounded-lg border border-[#00f7ff]/30">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-[#00f7ff]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]">Pilih Lokasi di Peta</h3>
              <p className="text-[10px] sm:text-xs text-[#e0d0ff]/70 hidden sm:block">Klik pada peta untuk menentukan lokasi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-[#bc13fe]/20 rounded-lg transition-all group flex-shrink-0"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5 text-[#e0d0ff] group-hover:text-[#ff44cc]" />
          </button>
        </div>

        {/* Map Container */}
        <div className="p-3 sm:p-6 flex-1 overflow-auto">
          <div className="relative h-[350px] sm:h-[400px] md:h-[500px] rounded-lg sm:rounded-xl overflow-hidden border-2 border-[#bc13fe]/30 shadow-[0_0_20px_rgba(188,19,254,0.2)]">
            {/* Controls Overlay */}
            <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-[1000] flex flex-col gap-2 sm:gap-3">
              {/* Basemap Toggle */}
              <div className="bg-slate-900/90 backdrop-blur-xl rounded-lg sm:rounded-xl shadow-[0_0_20px_rgba(0,247,255,0.2)] overflow-hidden border border-[#bc13fe]/30">
                <button
                  onClick={() => setBasemap('street')}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2.5 text-[10px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 w-full ${basemap === 'street'
                      ? 'bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black shadow-[0_0_15px_rgba(0,247,255,0.5)]'
                      : 'text-[#e0d0ff] hover:bg-[#bc13fe]/20'
                    }`}
                >
                  <Layers className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Street</span>
                  <span className="sm:hidden">S</span>
                </button>
                <button
                  onClick={() => setBasemap('satellite')}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2.5 text-[10px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 w-full border-t border-[#bc13fe]/20 ${basemap === 'satellite'
                      ? 'bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black shadow-[0_0_15px_rgba(0,247,255,0.5)]'
                      : 'text-[#e0d0ff] hover:bg-[#bc13fe]/20'
                    }`}
                >
                  <Layers className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Satelit</span>
                  <span className="sm:hidden">S</span>
                </button>
              </div>

              {/* GPS Button */}
              <button
                onClick={handleGetCurrentLocation}
                className="bg-slate-900/90 backdrop-blur-xl rounded-lg sm:rounded-xl shadow-[0_0_20px_rgba(0,247,255,0.2)] border border-[#bc13fe]/30 p-2 sm:p-3 hover:bg-[#bc13fe]/20 hover:shadow-[0_0_25px_rgba(0,247,255,0.4)] transition-all group"
                title="Gunakan lokasi saya"
              >
                <Navigation className="h-4 w-4 sm:h-5 sm:w-5 text-[#00f7ff] group-hover:text-[#ff44cc]" />
              </button>
            </div>

            {/* Map div */}
            <div
              ref={mapContainerRef}
              className="h-full w-full"
              style={{ minHeight: '300px' }}
            />

            {/* Loading overlay */}
            {!mapLoaded && (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-[#1a0f35] flex items-center justify-center">
                <div className="text-center">
                  <div className="relative mx-auto mb-4">
                    <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 border-4 border-[#bc13fe]/30 border-t-[#00f7ff] rounded-full shadow-[0_0_20px_rgba(0,247,255,0.5)]"></div>
                  </div>
                  <p className="text-xs sm:text-sm text-[#e0d0ff]">Memuat peta...</p>
                </div>
              </div>
            )}
          </div>

          {/* Coordinates Display */}
          <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {position ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-[#bc13fe]/20 to-[#00f7ff]/20 border border-[#00f7ff]/30 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg flex-1 min-w-0">
                <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-[#00f7ff] flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] sm:text-xs text-[#e0d0ff]/70">Koordinat: </span>
                  <span className="font-mono font-semibold text-[10px] sm:text-xs text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.5)] break-all">
                    {position[0].toFixed(6)}, {position[1].toFixed(6)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-[#e0d0ff]/60 flex items-center gap-1.5 sm:gap-2">
                <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-[#bc13fe]" />
                <span className="text-[10px] sm:text-sm">Klik pada peta untuk memilih lokasi</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 border-t border-[#bc13fe]/20 bg-gradient-to-r from-[#bc13fe]/5 to-[#00f7ff]/5 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold border-2 border-[#bc13fe]/40 text-[#e0d0ff] rounded-lg sm:rounded-xl hover:bg-[#bc13fe]/10 hover:border-[#bc13fe]/60 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!position}
            className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black rounded-lg sm:rounded-xl hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all"
          >
            Pilih Lokasi Ini
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
