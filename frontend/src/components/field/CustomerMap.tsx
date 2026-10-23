'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet';
import { cn } from '@/lib/utils';

export type MapTone = 'green' | 'red' | 'amber' | 'slate';

export interface MapPoint {
  id: string;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
  tone: MapTone;
}

// Marker fills: the -600 status shades, readable on both street and satellite tiles.
const FILL: Record<MapTone, string> = { green: '#059669', red: '#DC2626', amber: '#D97706', slate: '#64748B' };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * Customers as coloured dots on a Leaflet map (same self-hosted Leaflet and
 * OSM / Esri tiles as MapPicker). Tapping a dot calls onSelect with its id.
 */
export default function CustomerMap({
  points,
  onSelect,
  selectedId,
  className,
  zoom = 16,
  pin = false,
}: {
  points: MapPoint[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
  /** Zoom used when there is a single point. */
  zoom?: number;
  /** Standard map pin instead of a dot, as in the admin's customer detail. */
  pin?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tilesRef = useRef<{ street: TileLayer; satellite: TileLayer } | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<'street' | 'satellite'>('street');

  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/leaflet/leaflet.css';
        document.head.appendChild(link);
      }
      // Self-hosted pin images, as MapPicker does.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([-2.5, 118], 5);
      const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      });
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19,
      });
      street.addTo(map);
      tilesRef.current = { street, satellite };
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch tiles.
  useEffect(() => {
    const map = mapRef.current;
    const tiles = tilesRef.current;
    if (!map || !tiles) return;
    const [on, off] = basemap === 'street' ? [tiles.street, tiles.satellite] : [tiles.satellite, tiles.street];
    if (map.hasLayer(off)) map.removeLayer(off);
    if (!map.hasLayer(on)) on.addTo(map);
  }, [basemap, ready]);

  // Draw the points and frame them.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      for (const p of points) {
        const selected = p.id === selectedId;
        const marker = pin
          ? L.marker([p.lat, p.lng], { keyboard: false })
          : L.circleMarker([p.lat, p.lng], {
              radius: selected ? 10 : 7,
              color: '#ffffff',
              weight: 2,
              fillColor: FILL[p.tone],
              fillOpacity: 1,
            });
        marker.bindTooltip(`<strong>${escapeHtml(p.name)}</strong>${p.subtitle ? `<br>${escapeHtml(p.subtitle)}` : ''}`, { direction: 'top', offset: [0, -6] });
        if (onSelectRef.current) marker.on('click', () => onSelectRef.current?.(p.id));
        marker.addTo(layer);
      }
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], zoom);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [32, 32], maxZoom: 17 });
      }
      // The container may have changed size since the map was made (sheet, tab switch).
      setTimeout(() => map.invalidateSize(), 50);
    })();
  }, [points, selectedId, ready, zoom, pin]);

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border', className)}>
      <div ref={containerRef} className="absolute inset-0 z-0" role="region" aria-label="Peta lokasi pelanggan" />
      <div className="absolute top-2 right-2 z-[400] flex rounded-xl border border-border bg-card p-0.5" role="group" aria-label="Jenis peta">
        {(['street', 'satellite'] as const).map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={basemap === b}
            onClick={() => setBasemap(b)}
            className={cn(
              'h-[36px] px-3 rounded-lg text-[12px] font-medium pointer-coarse:h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              basemap === b ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {b === 'street' ? 'Peta' : 'Satelit'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Google Maps links: open the spot, or start turn-by-turn directions to it. */
export const mapsLinks = (lat: number, lng: number) => ({
  view: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  directions: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
});
