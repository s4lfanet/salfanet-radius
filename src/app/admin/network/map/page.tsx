'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { MapPin, Radio, Box, Server, Users, Filter, RefreshCw, Layers, Eye, EyeOff, Edit, Phone, Mail, MapPinned, Wifi, WifiOff, AlertTriangle, CheckCircle, XCircle, Navigation, Crosshair, Map, Loader2 } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import UserDetailModal from '@/components/UserDetailModal';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

// Dynamic import Leaflet components
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);

interface OLT {
  id: string;
  name: string;
  brand: string;
  model: string;
  ipAddress: string;
  latitude: number;
  longitude: number;
}

interface ODC {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  oltId: string;
  olt?: OLT;
}

interface ODP {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  portCount: number;
  usedPorts: number;
  odcId: string | null;
  parentOdpId: string | null;
  odc?: ODC;
  parentOdp?: ODP;
}

interface Customer {
  id: string;
  username: string;
  name: string;
  fullName?: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  ipAddress: string | null;
  macAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  expiredAt: string | null;
  createdAt: string;
  isOnline?: boolean;
  profile?: {
    id: string;
    name: string;
    price: number;
  };
  router?: {
    id: string;
    nasname: string;
    shortname: string;
  };
  odpAssignment?: {
    id: string;
    portNumber: number;
    odp: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
    };
  } | null;
}

interface Profile {
  id: string;
  name: string;
  price: number;
}

interface Router {
  id: string;
  name: string;
  nasname: string;
  shortname: string;
  ipAddress: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

// Router-OLT connection with uplink info
interface RouterOltConnection {
  id: string;
  routerId: string;
  oltId: string;
  oltName: string;
  oltIp: string;
  oltLatitude: number;
  oltLongitude: number;
  uplinkPort: string | null;
  priority: number;
  isActive: boolean;
}

// Ping result for real-time status
interface PingResult {
  oltId: string;
  oltName: string;
  status: 'success' | 'failed' | 'timeout' | 'error';
  avgRtt: number | null;
  packetLoss: number;
}

export default function NetworkMapPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { addToast } = useToast();
  const mapRef = useRef<any>(null);
  const [olts, setOlts] = useState<OLT[]>([]);
  const [odcs, setOdcs] = useState<ODC[]>([]);
  const [odps, setOdps] = useState<ODP[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routerList, setRouterList] = useState<Router[]>([]);
  const [routerOltConnections, setRouterOltConnections] = useState<Record<string, RouterOltConnection[]>>({});
  const [routerPingStatus, setRouterPingStatus] = useState<Record<string, PingResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // Edit Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Layer visibility
  const [showOlts, setShowOlts] = useState(true);
  const [showOdcs, setShowOdcs] = useState(true);
  const [showOdps, setShowOdps] = useState(true);
  const [showCustomers, setShowCustomers] = useState(true);
  const [showRouters, setShowRouters] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [showCustomerCables, setShowCustomerCables] = useState(true);

  // Filter
  const [selectedOlt, setSelectedOlt] = useState<string>('');
  const [selectedOdc, setSelectedOdc] = useState<string>('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<string>('');

  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [selectedMapLayer, setSelectedMapLayer] = useState<'street' | 'satellite' | 'topo' | 'dark'>('street');

  // Initialize Leaflet icons on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });
        setMapReady(true);
      });
    }
  }, []);

  // Custom marker icons with labels - improved design
  const createIconWithLabel = (iconSvg: string, label: string, color: string, bgGradient: string, size: number = 32) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="text-align: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <div style="background: ${bgGradient}; width: ${size}px; height: ${size}px; border-radius: 10px; border: 3px solid white; display: flex; align-items: center; justify-content: center; position: relative;">
            ${iconSvg}
          </div>
          <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; margin-top: 4px; white-space: nowrap; border: 1px solid rgba(255,255,255,0.3); letter-spacing: 0.3px;">${label}</div>
        </div>
      `,
      iconSize: [size + 30, size + 35],
      iconAnchor: [(size + 30) / 2, size + 20],
      popupAnchor: [0, -(size + 15)],
    });
  };

  // Customer house icon with status indicator
  const createCustomerHouseIcon = (color: string, statusColor: string, isOnline: boolean = false, size: number = 28) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    const pulseAnimation = isOnline ? `
      <div style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px;">
        <div style="background: ${statusColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; position: absolute;"></div>
        <div style="background: ${statusColor}; width: 12px; height: 12px; border-radius: 50%; animation: pulse 1.5s ease-out infinite; opacity: 0.6; position: absolute;"></div>
      </div>
    ` : `
      <div style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: ${statusColor}; border-radius: 50%; border: 2px solid white;"></div>
    `;

    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="position: relative; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.25));">
          <div style="background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%); width: ${size}px; height: ${size}px; border-radius: 8px; border: 2px solid white; display: flex; align-items: center; justify-content: center; position: relative;">
            <svg width="${size - 10}" height="${size - 10}" viewBox="0 0 24 24" fill="white">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22" fill="rgba(255,255,255,0.3)"/>
            </svg>
          </div>
          ${pulseAnimation}
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        </style>
      `,
      iconSize: [size + 8, size + 8],
      iconAnchor: [(size + 8) / 2, (size + 8) / 2],
      popupAnchor: [0, -(size / 2 + 4)],
    });
  };

  // Better SVG Icons for OLT, ODC, ODP
  // OLT - Server/Tower icon
  const oltSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="2" width="16" height="6" rx="1" fill="rgba(255,255,255,0.3)"/>
    <rect x="4" y="10" width="16" height="6" rx="1" fill="rgba(255,255,255,0.3)"/>
    <line x1="8" y1="5" x2="8" y2="5"/>
    <line x1="8" y1="13" x2="8" y2="13"/>
    <circle cx="8" cy="5" r="1" fill="white"/>
    <circle cx="8" cy="13" r="1" fill="white"/>
    <line x1="12" y1="5" x2="16" y2="5" stroke="white" stroke-width="1.5"/>
    <line x1="12" y1="13" x2="16" y2="13" stroke="white" stroke-width="1.5"/>
    <path d="M6 18v2M12 18v2M18 18v2" stroke="white" stroke-width="2"/>
  </svg>`;

  // ODC - Distribution Cabinet icon  
  const odcSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="rgba(255,255,255,0.2)"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="3" y1="15" x2="21" y2="15"/>
    <circle cx="7" cy="6" r="1" fill="white"/>
    <circle cx="7" cy="12" r="1" fill="white"/>
    <circle cx="7" cy="18" r="1" fill="white"/>
    <line x1="11" y1="6" x2="17" y2="6" stroke="white" stroke-width="1.5"/>
    <line x1="11" y1="12" x2="17" y2="12" stroke="white" stroke-width="1.5"/>
    <line x1="11" y1="18" x2="17" y2="18" stroke="white" stroke-width="1.5"/>
  </svg>`;

  // ODP - Distribution Point/Box icon
  const odpSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" fill="rgba(255,255,255,0.2)"/>
    <circle cx="8" cy="9" r="1.5" fill="white"/>
    <circle cx="12" cy="9" r="1.5" fill="white"/>
    <circle cx="16" cy="9" r="1.5" fill="white"/>
    <circle cx="8" cy="15" r="1.5" fill="white"/>
    <circle cx="12" cy="15" r="1.5" fill="white"/>
    <circle cx="16" cy="15" r="1.5" fill="white"/>
  </svg>`;

  // Router/Mikrotik icon - network device with antennas
  const routerSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="8" width="20" height="10" rx="2" fill="rgba(255,255,255,0.3)"/>
    <circle cx="6" cy="13" r="1.5" fill="white"/>
    <circle cx="10" cy="13" r="1.5" fill="white"/>
    <line x1="14" y1="11" x2="20" y2="11" stroke="white" stroke-width="1.5"/>
    <line x1="14" y1="13" x2="18" y2="13" stroke="white" stroke-width="1.5"/>
    <line x1="14" y1="15" x2="20" y2="15" stroke="white" stroke-width="1.5"/>
    <path d="M5 8V4M9 8V5M19 8V4" stroke="white" stroke-width="1.5"/>
    <circle cx="5" cy="3" r="1" fill="white"/>
    <circle cx="9" cy="4" r="1" fill="white"/>
    <circle cx="19" cy="3" r="1" fill="white"/>
  </svg>`;

  // Get customer icon based on status - now using house icons
  const getCustomerIcon = (customer: Customer) => {
    if (customer.status === 'isolir') {
      return createCustomerHouseIcon('#f59e0b', '#f59e0b', false, 26); // Orange house
    }
    if (customer.status === 'expired' || customer.status === 'suspended') {
      return createCustomerHouseIcon('#ef4444', '#ef4444', false, 26); // Red house
    }
    if (customer.status === 'inactive') {
      return createCustomerHouseIcon('#6b7280', '#6b7280', false, 26); // Gray house
    }
    // Active status
    if (customer.isOnline) {
      return createCustomerHouseIcon('#22c55e', '#22c55e', true, 26); // Green house with pulse
    }
    return createCustomerHouseIcon('#3b82f6', '#3b82f6', false, 26); // Blue house
  };

  // Get status label and color
  const getStatusInfo = (customer: Customer) => {
    if (customer.status === 'isolir') {
      return { label: 'Isolir', color: 'text-orange-600 bg-orange-100', icon: AlertTriangle };
    }
    if (customer.status === 'expired' || customer.status === 'suspended') {
      return { label: 'Nunggak/Expired', color: 'text-destructive bg-destructive/20', icon: XCircle };
    }
    if (customer.status === 'inactive') {
      return { label: 'Nonaktif', color: 'text-muted-foreground bg-gray-100', icon: XCircle };
    }
    if (customer.isOnline) {
      return { label: 'Online', color: 'text-success bg-success/20', icon: Wifi };
    }
    return { label: 'Offline', color: 'text-primary bg-primary/20', icon: WifiOff };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [oltsRes, odcsRes, odpsRes, customersRes, profilesRes, routersRes] = await Promise.all([
        fetch('/api/network/olts'),
        fetch('/api/network/odcs'),
        fetch('/api/network/odps'),
        fetch('/api/pppoe/users?limit=5000'),
        fetch('/api/pppoe/profiles'),
        fetch('/api/network/routers'),
      ]);

      if (oltsRes.ok) {
        const data = await oltsRes.json();
        setOlts(data.olts || data);
      }
      if (odcsRes.ok) {
        const data = await odcsRes.json();
        setOdcs(data.odcs || data);
      }
      if (odpsRes.ok) {
        const data = await odpsRes.json();
        setOdps(data.odps || data);
      }
      if (customersRes.ok) {
        const data = await customersRes.json();
        const customersWithGps = (data.users || data).filter((c: Customer) => c.latitude && c.longitude);
        setCustomers(customersWithGps);
      }
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles || data);
      }
      if (routersRes.ok) {
        const data = await routersRes.json();
        const routersData = data.routers || data;
        setRouterList(routersData);

        // Fetch uplink connections for routers with GPS
        const routersWithGps = routersData.filter((r: Router) => r.latitude && r.longitude);
        const connectionPromises = routersWithGps.map(async (r: Router) => {
          try {
            const res = await fetch(`/api/network/routers/${r.id}/uplinks`);
            if (res.ok) {
              const connData = await res.json();
              return { routerId: r.id, connections: connData.connections || [] };
            }
          } catch (e) {
            console.error(`Failed to fetch uplinks for router ${r.id}:`, e);
          }
          return { routerId: r.id, connections: [] };
        });

        const connectionResults = await Promise.all(connectionPromises);
        const connMap: Record<string, RouterOltConnection[]> = {};
        connectionResults.forEach(({ routerId, connections }) => {
          connMap[routerId] = connections;
        });
        setRouterOltConnections(connMap);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      addToast({ type: 'error', title: t('common.error'), description: t('network.map.failedLoadNetwork') });
    } finally {
      setLoading(false);
    }
  };

  // Ping OLT from router
  const pingOltFromRouter = async (routerId: string) => {
    try {
      const res = await fetch(`/api/network/routers/${routerId}/ping-olt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3, timeout: 500 }),
      });

      if (res.ok) {
        const data = await res.json();
        setRouterPingStatus(prev => ({
          ...prev,
          [routerId]: data.results || []
        }));
        return data.results;
      }
    } catch (error) {
      console.error('Ping error:', error);
    }
    return [];
  };

  // Handle edit customer - closes popup and opens modal
  const handleEditCustomer = (customer: Customer) => {
    // Close all popups first
    if (mapRef.current) {
      mapRef.current.closePopup();
    }
    setEditingCustomer(customer);
    setEditModalOpen(true);
  };

  // Handle save customer
  const handleSaveCustomer = async (data: Record<string, unknown>) => {
    if (!editingCustomer) return;

    try {
      const res = await fetch(`/api/pppoe/users/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('common.failedToUpdate'));
      }

      addToast({ type: 'success', title: t('common.success'), description: t('network.map.customerUpdated'), duration: 2000 });

      setEditModalOpen(false);
      setEditingCustomer(null);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error saving customer:', error);
      addToast({ type: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('common.failedToSave') });
    }
  };

  // Detect user location
  const detectUserLocation = () => {
    if (!navigator.geolocation) {
      addToast({ type: 'error', title: t('common.error'), description: t('network.map.geolocationNotSupported') });
      return;
    }

    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setLocatingUser(false);

        // Pan map to user location
        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], 16, { duration: 1.5 });
        }

        addToast({ type: 'success', title: 'Lokasi Ditemukan', description: `Latitude: ${latitude.toFixed(6)}, Longitude: ${longitude.toFixed(6)}`, duration: 3000 });
      },
      (error) => {
        setLocatingUser(false);
        let message = 'Gagal mendapatkan lokasi';
        let title = 'Error';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Akses lokasi ditolak. Silakan izinkan akses lokasi di pengaturan browser:\n\n1. Klik ikon gembok di address bar\n2. Izinkan akses lokasi\n3. Refresh halaman';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'GPS tidak tersedia. Pastikan:\n\n• Perangkat memiliki GPS\n• GPS diaktifkan\n• Koneksi internet stabil';
            break;
          case error.TIMEOUT:
            title = 'Timeout';
            message = 'Deteksi lokasi membutuhkan waktu lebih lama. Pastikan:\n\n• GPS perangkat aktif\n• Berada di area terbuka\n• Izin lokasi sudah diberikan\n\nCoba lagi dalam beberapa saat.';
            break;
        }
        addToast({ type: error.code === error.TIMEOUT ? 'warning' : 'error', title: title, description: message });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  };

  // Create user location icon
  const createUserLocationIcon = () => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="position: relative;">
          <div style="width: 24px; height: 24px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>
          <div style="position: absolute; top: 50%; left: 50%; width: 40px; height: 40px; background: rgba(59, 130, 246, 0.2); border-radius: 50%; transform: translate(-50%, -50%); animation: pulse-location 2s ease-out infinite;"></div>
        </div>
        <style>
          @keyframes pulse-location {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
          }
        </style>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    });
  };

  // Map tile layers configuration
  const mapLayers = {
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      name: 'Street'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a> World Imagery',
      name: 'Satellite'
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      name: 'Topographic'
    },
    dark: {
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
      name: 'Dark Mode'
    }
  };

  // Fetch data when map is ready
  useEffect(() => {
    if (mapReady) {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Calculate map center
  const mapCenter = useMemo(() => {
    const allPoints = [
      ...olts.map(o => ({ lat: o.latitude, lng: o.longitude })),
      ...odcs.map(o => ({ lat: o.latitude, lng: o.longitude })),
      ...odps.map(o => ({ lat: o.latitude, lng: o.longitude })),
      ...routerList.filter(r => r.latitude && r.longitude).map(r => ({ lat: r.latitude!, lng: r.longitude! })),
    ];

    if (allPoints.length === 0) {
      return { lat: -6.2088, lng: 106.8456 }; // Default Jakarta
    }

    const sumLat = allPoints.reduce((sum, p) => sum + p.lat, 0);
    const sumLng = allPoints.reduce((sum, p) => sum + p.lng, 0);
    return {
      lat: sumLat / allPoints.length,
      lng: sumLng / allPoints.length,
    };
  }, [olts, odcs, odps, routerList]);

  // Filter routers with GPS
  const routersWithGps = useMemo(() => {
    return routerList.filter(r => r.latitude && r.longitude && r.isActive);
  }, [routerList]);

  // Filter data based on selection
  const filteredOdcs = useMemo(() => {
    if (!selectedOlt) return odcs;
    return odcs.filter(o => o.oltId === selectedOlt);
  }, [odcs, selectedOlt]);

  const filteredOdps = useMemo(() => {
    let result = odps;
    if (selectedOdc) {
      result = result.filter(o => o.odcId === selectedOdc);
    } else if (selectedOlt) {
      const odcIds = filteredOdcs.map(o => o.id);
      result = result.filter(o => o.odcId && odcIds.includes(o.odcId));
    }
    return result;
  }, [odps, selectedOlt, selectedOdc, filteredOdcs]);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by status
    if (customerStatusFilter) {
      if (customerStatusFilter === 'online') {
        result = result.filter(c => c.status === 'active' && c.isOnline);
      } else if (customerStatusFilter === 'offline') {
        result = result.filter(c => c.status === 'active' && !c.isOnline);
      } else if (customerStatusFilter === 'isolir') {
        result = result.filter(c => c.status === 'isolir');
      } else if (customerStatusFilter === 'expired') {
        result = result.filter(c => c.status === 'expired' || c.status === 'suspended');
      }
    }

    return result;
  }, [customers, customerStatusFilter]);

  // Connection lines (OLT -> ODC -> ODP)
  const connectionLines = useMemo(() => {
    const lines: { positions: [number, number][]; color: string; dashArray?: string }[] = [];

    if (!showConnections) return lines;

    // OLT to ODC connections
    filteredOdcs.forEach(odc => {
      const olt = olts.find(o => o.id === odc.oltId);
      if (olt && showOlts && showOdcs) {
        lines.push({
          positions: [
            [olt.latitude, olt.longitude],
            [odc.latitude, odc.longitude],
          ],
          color: '#f59e0b',
        });
      }
    });

    // ODC to ODP connections
    filteredOdps.forEach(odp => {
      if (odp.odcId) {
        const odc = odcs.find(o => o.id === odp.odcId);
        if (odc && showOdcs && showOdps) {
          lines.push({
            positions: [
              [odc.latitude, odc.longitude],
              [odp.latitude, odp.longitude],
            ],
            color: '#22c55e',
          });
        }
      }
      // Parent ODP connections
      if (odp.parentOdpId) {
        const parentOdp = odps.find(o => o.id === odp.parentOdpId);
        if (parentOdp && showOdps) {
          lines.push({
            positions: [
              [parentOdp.latitude, parentOdp.longitude],
              [odp.latitude, odp.longitude],
            ],
            color: '#10b981',
          });
        }
      }
    });

    return lines;
  }, [olts, filteredOdcs, filteredOdps, odcs, odps, showOlts, showOdcs, showOdps, showConnections]);

  // Customer cable lines (ODP -> Customer)
  const customerCableLines = useMemo(() => {
    const lines: { positions: [number, number][]; color: string; dashArray?: string }[] = [];

    if (!showCustomerCables || !showCustomers) return lines;

    filteredCustomers.forEach(customer => {
      if (customer.latitude && customer.longitude && customer.odpAssignment?.odp) {
        const odp = customer.odpAssignment.odp;
        // Color based on customer status
        let color = '#3b82f6'; // Blue default
        if (customer.status === 'isolir') color = '#f59e0b'; // Orange
        else if (customer.status === 'expired' || customer.status === 'suspended') color = '#ef4444'; // Red
        else if (customer.isOnline) color = '#22c55e'; // Green

        lines.push({
          positions: [
            [odp.latitude, odp.longitude],
            [customer.latitude, customer.longitude],
          ],
          color,
          dashArray: '3, 6',
        });
      }
    });

    return lines;
  }, [filteredCustomers, showCustomerCables, showCustomers]);

  // Router to OLT uplink lines
  const routerOltLines = useMemo(() => {
    const lines: { positions: [number, number][]; color: string; dashArray?: string; weight?: number }[] = [];

    if (!showConnections || !showRouters || !showOlts) return lines;

    routersWithGps.forEach(r => {
      if (r.latitude && r.longitude) {
        const connections = routerOltConnections[r.id] || [];
        const pingResults = routerPingStatus[r.id] || [];

        connections.forEach(conn => {
          if (conn.oltLatitude && conn.oltLongitude && conn.isActive) {
            // Get ping status for this OLT
            const pingResult = pingResults.find(p => p.oltId === conn.oltId);

            // Color based on ping status
            let color = '#6366f1'; // Default purple for router-olt link
            let dashArray = undefined;

            if (pingResult) {
              if (pingResult.status === 'success' && pingResult.packetLoss === 0) {
                color = '#22c55e'; // Green - good connection
              } else if (pingResult.status === 'success' && pingResult.packetLoss > 0) {
                color = '#f59e0b'; // Orange - some packet loss
              } else {
                color = '#ef4444'; // Red - failed
                dashArray = '5, 10';
              }
            }

            lines.push({
              positions: [
                [r.latitude!, r.longitude!],
                [conn.oltLatitude, conn.oltLongitude],
              ],
              color,
              dashArray,
              weight: conn.priority === 0 ? 3 : 2, // Primary link thicker
            });
          }
        });
      }
    });

    return lines;
  }, [routersWithGps, routerOltConnections, routerPingStatus, showConnections, showRouters, showOlts]);

  // Statistics
  const stats = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === 'active');
    const onlineCustomers = customers.filter(c => c.status === 'active' && c.isOnline);
    const isolirCustomers = customers.filter(c => c.status === 'isolir');
    const expiredCustomers = customers.filter(c => c.status === 'expired' || c.status === 'suspended');

    return {
      totalOlts: olts.length,
      totalOdcs: odcs.length,
      totalOdps: odps.length,
      totalPorts: odps.reduce((sum, o) => sum + o.portCount, 0),
      usedPorts: odps.reduce((sum, o) => sum + o.usedPorts, 0),
      totalCustomers: customers.length,
      activeCustomers: activeCustomers.length,
      onlineCustomers: onlineCustomers.length,
      isolirCustomers: isolirCustomers.length,
      expiredCustomers: expiredCustomers.length,
    };
  }, [olts, odcs, odps, customers]);

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return formatWIB(dateStr, 'dd MMM yyyy');
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (!mapReady) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <div className="text-center relative z-10">
          <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] mx-auto mb-4" />
          <p className="text-muted-foreground">{t('common.loadingMap')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-3">
              <MapPin className="w-6 h-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.8)]" />
              Network Map
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('common.networkVisualization')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Detect Location Button */}
            <button
              onClick={detectUserLocation}
              disabled={locatingUser}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              title="Deteksi Lokasi Saya"
            >
              {locatingUser ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              {t('common.myLocation')}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive dark:text-destructive">
              <Server className="w-4 h-4" />
              <span className="text-xs font-medium">OLT</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-destructive dark:text-red-300 mt-1">{stats.totalOlts}</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Box className="w-4 h-4" />
              <span className="text-xs font-medium">ODC</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-orange-700 dark:text-orange-300 mt-1">{stats.totalOdcs}</p>
          </div>
          <div className="bg-success/10 rounded-lg p-3 border border-success/30">
            <div className="flex items-center gap-2 text-success dark:text-success">
              <Radio className="w-4 h-4" />
              <span className="text-xs font-medium">ODP</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-success dark:text-green-300 mt-1">{stats.totalOdps}</p>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 border border-primary/30">
            <div className="flex items-center gap-2 text-primary dark:text-primary">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium">Total GPS</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{stats.totalCustomers}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Wifi className="w-4 h-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{stats.onlineCustomers}</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 border border-sky-200 dark:border-sky-800">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Aktif</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-sky-700 dark:text-sky-300 mt-1">{stats.activeCustomers}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">Isolir</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.isolirCustomers}</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3 border border-rose-200 dark:border-rose-800">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <XCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Nunggak</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">{stats.expiredCustomers}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 bg-card rounded-lg p-4 shadow-sm">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filter:</span>
          </div>
          <select
            value={selectedOlt}
            onChange={(e) => {
              setSelectedOlt(e.target.value);
              setSelectedOdc('');
            }}
            className="text-sm border rounded-lg px-3 py-1.5 bg-card border-border"
          >
            <option value="">{t('common.allOlt')}</option>
            {olts.map(olt => (
              <option key={olt.id} value={olt.id}>{olt.name}</option>
            ))}
          </select>
          <select
            value={selectedOdc}
            onChange={(e) => setSelectedOdc(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-card border-border"
            disabled={!selectedOlt}
          >
            <option value="">{t('common.allOdc')}</option>
            {filteredOdcs.map(odc => (
              <option key={odc.id} value={odc.id}>{odc.name}</option>
            ))}
          </select>
          <select
            value={customerStatusFilter}
            onChange={(e) => setCustomerStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-card border-border"
          >
            <option value="">{t('common.allStatus')}</option>
            <option value="online">🟢 Online</option>
            <option value="offline">🔵 Offline</option>
            <option value="isolir">🟠 Isolir</option>
            <option value="expired">🔴 Nunggak</option>
          </select>

          <div className="h-6 border-l border-border" />

          {/* Map Style Selector */}
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Peta:</span>
          </div>
          <select
            value={selectedMapLayer}
            onChange={(e) => setSelectedMapLayer(e.target.value as 'street' | 'satellite' | 'topo' | 'dark')}
            className="px-3 py-1.5 border rounded-lg text-sm bg-card border-border"
          >
            <option value="street">🗺️ Street</option>
            <option value="satellite">🛰️ Satellite</option>
            <option value="topo">🏔️ Topographic</option>
            <option value="dark">🌙 Dark Mode</option>
          </select>

          <div className="h-6 border-l border-border" />

          {/* Layer toggles */}
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Layer:</span>
          </div>
          <button
            onClick={() => setShowOlts(!showOlts)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showOlts
              ? 'bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showOlts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            OLT
          </button>
          <button
            onClick={() => setShowOdcs(!showOdcs)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showOdcs
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showOdcs ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            ODC
          </button>
          <button
            onClick={() => setShowOdps(!showOdps)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showOdps
              ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showOdps ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            ODP
          </button>
          <button
            onClick={() => setShowCustomers(!showCustomers)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showCustomers
              ? 'bg-primary/20 text-primary dark:text-primary'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showCustomers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {t('common.customer')}
          </button>
          <button
            onClick={() => setShowRouters(!showRouters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showRouters
              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showRouters ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Router
          </button>
          <button
            onClick={() => setShowConnections(!showConnections)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showConnections
              ? 'bg-accent/20 text-accent dark:bg-purple-900/30 dark:text-purple-400'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showConnections ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {t('common.mainCable')}
          </button>
          <button
            onClick={() => setShowCustomerCables(!showCustomerCables)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showCustomerCables
              ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
              : 'bg-muted text-muted-foreground'
              }`}
          >
            {showCustomerCables ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {t('common.customerCable')}
          </button>
        </div>

        {/* Map */}
        <div className="bg-card rounded-lg shadow-sm overflow-hidden" style={{ height: '600px' }}>
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
          />
          <MapContainer
            key={`map-${olts.length}-${odcs.length}-${odps.length}-${customers.length}`}
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              key={selectedMapLayer}
              attribution={mapLayers[selectedMapLayer].attribution}
              url={mapLayers[selectedMapLayer].url}
            />

            {/* User Location Marker */}
            {userLocation && (
              <>
                <Marker
                  position={[userLocation.lat, userLocation.lng]}
                  icon={createUserLocationIcon()}
                >
                  <Popup>
                    <div className="text-center p-2">
                      <div className="flex items-center gap-2 justify-center text-primary font-bold mb-2">
                        <Navigation className="w-4 h-4" />
                        {t('common.yourLocation')}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                      </p>
                    </div>
                  </Popup>
                </Marker>
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={30}
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
                />
              </>
            )}

            {/* Connection Lines */}
            {connectionLines.map((line, idx) => (
              <Polyline
                key={`line-${idx}`}
                positions={line.positions}
                color={line.color}
                weight={2}
                opacity={0.7}
              />
            ))}

            {/* Customer Cable Lines (ODP-Customer) */}
            {customerCableLines.map((line, idx) => (
              <Polyline
                key={`customer-line-${idx}`}
                positions={line.positions}
                color={line.color}
                weight={1.5}
                opacity={0.5}
                dashArray={line.dashArray}
              />
            ))}

            {/* Router to OLT Uplink Lines */}
            {routerOltLines.map((line, idx) => (
              <Polyline
                key={`router-olt-line-${idx}`}
                positions={line.positions}
                color={line.color}
                weight={line.weight || 2}
                opacity={0.8}
                dashArray={line.dashArray}
              />
            ))}

            {/* Router Markers */}
            {showRouters && routersWithGps.map(r => {
              const routerIcon = createIconWithLabel(routerSvg, r.shortname || r.name, '#6366f1', 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 38);
              const connections = routerOltConnections[r.id] || [];
              const pingResults = routerPingStatus[r.id] || [];

              return (
                <Marker
                  key={`router-${r.id}`}
                  position={[r.latitude!, r.longitude!]}
                  icon={routerIcon}
                >
                  <Popup maxWidth={360} className="custom-popup">
                    <div className="popup-card">
                      {/* Header */}
                      <div className="popup-header bg-gradient-to-r from-indigo-500 to-indigo-600">
                        <div className="flex items-center gap-2">
                          <Radio className="w-5 h-5" />
                          <span className="font-bold text-lg">Router/NAS</span>
                        </div>
                        <p className="text-white/80 text-sm mt-1">{r.name}</p>
                      </div>

                      {/* Router Info */}
                      <div className="popup-content">
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center text-sm">
                            <span className="w-20 text-muted-foreground font-medium">IP Address:</span>
                            <span className="text-gray-800 font-mono">{r.ipAddress}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-20 text-muted-foreground font-medium">NAS Name:</span>
                            <span className="text-gray-800">{r.nasname}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-20 text-muted-foreground font-medium">Status:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                              }`}>
                              {r.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* OLT Uplinks */}
                        {connections.length > 0 && (
                          <div className="border-t pt-3">
                            <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                              <Server className="w-4 h-4 text-destructive" />
                              Uplink ke OLT ({connections.length})
                            </p>
                            <div className="space-y-2">
                              {connections.map((conn, idx) => {
                                return (
                                  <div key={idx} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-success/100" />
                                      <div>
                                        <p className="text-sm font-medium text-gray-800">{conn.oltName}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {conn.uplinkPort || 'Auto'} • Priority: {conn.priority}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {connections.length === 0 && (
                          <p className="text-sm text-muted-foreground italic">Belum ada uplink OLT terkonfigurasi</p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* OLT Markers */}
            {showOlts && olts.map(olt => {
              const oltIcon = createIconWithLabel(oltSvg, olt.name, '#dc2626', 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', 40);
              // Get ODCs connected to this OLT
              const connectedOdcs = odcs.filter(odc => odc.oltId === olt.id);
              // Get routers connected to this OLT
              const connectedRouters = routerList.filter(r => {
                const conns = routerOltConnections[r.id] || [];
                return conns.some(c => c.oltId === olt.id);
              });
              return (
                <Marker
                  key={`olt-${olt.id}`}
                  position={[olt.latitude, olt.longitude]}
                  icon={oltIcon}
                >
                  <Popup maxWidth={320} className="custom-popup">
                    <div className="popup-card">
                      {/* Header */}
                      <div className="popup-header bg-gradient-to-r from-red-500 to-red-600">
                        <div className="flex items-center gap-2">
                          <Server className="w-5 h-5" />
                          <span className="font-bold text-lg">OLT</span>
                        </div>
                        <p className="text-white/80 text-sm mt-1">{olt.name}</p>
                      </div>

                      {/* Device Info */}
                      <div className="popup-content">
                        <div className="space-y-2">
                          <div className="flex items-center text-sm">
                            <span className="w-14 text-muted-foreground font-medium">Brand:</span>
                            <span className="text-gray-800">{olt.brand}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-14 text-muted-foreground font-medium">Model:</span>
                            <span className="text-gray-800">{olt.model}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-14 text-muted-foreground font-medium">IP:</span>
                            <span className="text-gray-800 font-mono text-xs bg-muted px-2 py-0.5 rounded">{olt.ipAddress}</span>
                          </div>
                        </div>

                        {/* Connected ODCs */}
                        {connectedOdcs.length > 0 && (
                          <div className="border-t border-gray-100 pt-3 mt-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              📦 Terhubung ke {connectedOdcs.length} ODC:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {connectedOdcs.map(odc => (
                                <span key={odc.id} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs font-medium border border-orange-200">
                                  <Box className="w-3 h-3" />
                                  {odc.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Connected Routers */}
                        {connectedRouters.length > 0 && (
                          <div className="border-t border-gray-100 pt-3 mt-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              📡 Uplink dari {connectedRouters.length} Router:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {connectedRouters.map(r => (
                                <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded text-xs font-medium border border-teal-200">
                                  <Radio className="w-3 h-3" />
                                  {r.shortname || r.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* GPS */}
                        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {olt.latitude.toFixed(6)}, {olt.longitude.toFixed(6)}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* ODC Markers */}
            {showOdcs && filteredOdcs.map(odc => {
              const odcIcon = createIconWithLabel(odcSvg, odc.name, '#ea580c', 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', 34);
              // Get ODPs connected to this ODC
              const connectedOdps = odps.filter(odp => odp.odcId === odc.id);
              // Get the parent OLT name
              const parentOlt = olts.find(olt => olt.id === odc.oltId);
              return (
                <Marker
                  key={`odc-${odc.id}`}
                  position={[odc.latitude, odc.longitude]}
                  icon={odcIcon}
                >
                  <Popup maxWidth={320} className="custom-popup">
                    <div className="popup-card">
                      {/* Header */}
                      <div className="popup-header bg-gradient-to-r from-orange-500 to-orange-600">
                        <div className="flex items-center gap-2">
                          <Box className="w-5 h-5" />
                          <span className="font-bold text-lg">ODC</span>
                        </div>
                        <p className="text-white/80 text-sm mt-1">{odc.name}</p>
                      </div>

                      {/* Content */}
                      <div className="popup-content">
                        {/* Connection Info */}
                        {parentOlt && (
                          <div className="flex items-center gap-2 text-sm mb-3">
                            <span className="text-muted-foreground font-medium">Dari OLT:</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-medium border border-destructive/30">
                              <Server className="w-3 h-3" />
                              {parentOlt.name}
                            </span>
                          </div>
                        )}

                        {/* Connected ODPs */}
                        {connectedOdps.length > 0 && (
                          <div className="border-t border-gray-100 pt-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              🏠 Terhubung ke {connectedOdps.length} ODP:
                            </p>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                              {connectedOdps.map(odp => (
                                <span key={odp.id} className="inline-flex items-center gap-1 px-2 py-1 bg-success/10 text-success rounded text-xs font-medium border border-success/30">
                                  <Radio className="w-3 h-3" />
                                  {odp.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* GPS */}
                        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {odc.latitude.toFixed(6)}, {odc.longitude.toFixed(6)}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* ODP Markers */}
            {showOdps && filteredOdps.map(odp => {
              const odpIcon = createIconWithLabel(odpSvg, odp.name, '#16a34a', 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', 28);
              // Get customers connected to this ODP
              const connectedCustomers = customers.filter(c => c.odpAssignment?.odp.id === odp.id);
              // Get parent ODC or ODP
              const parentOdc = odp.odcId ? odcs.find(odc => odc.id === odp.odcId) : null;
              const portUsagePercent = Math.round((odp.usedPorts / odp.portCount) * 100);
              return (
                <Marker
                  key={`odp-${odp.id}`}
                  position={[odp.latitude, odp.longitude]}
                  icon={odpIcon}
                >
                  <Popup maxWidth={320} className="custom-popup">
                    <div className="popup-card">
                      {/* Header */}
                      <div className="popup-header bg-gradient-to-r from-green-500 to-green-600">
                        <div className="flex items-center gap-2">
                          <Radio className="w-5 h-5" />
                          <span className="font-bold text-lg">ODP</span>
                        </div>
                        <p className="text-white/80 text-sm mt-1">{odp.name}</p>
                      </div>

                      {/* Content */}
                      <div className="popup-content">
                        {/* Port Info */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground font-medium">Penggunaan Port:</span>
                            <span className="font-semibold text-gray-800">{odp.usedPorts} / {odp.portCount}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${portUsagePercent > 80 ? 'bg-destructive/100' :
                                portUsagePercent > 50 ? 'bg-warning/100' : 'bg-success/100'
                                }`}
                              style={{ width: `${portUsagePercent}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground text-right">{portUsagePercent}% terpakai</p>
                        </div>

                        {/* Connection Info */}
                        {parentOdc && (
                          <div className="border-t border-gray-100 pt-3 mb-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Terhubung Dari:</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs font-medium border border-orange-200">
                                <Box className="w-3 h-3" />
                                {parentOdc.name}
                              </span>
                              {parentOdc.olt && (
                                <>
                                  <span className="text-gray-300">←</span>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-medium border border-destructive/30">
                                    <Server className="w-3 h-3" />
                                    {parentOdc.olt.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Connected Customers count */}
                        {connectedCustomers.length > 0 && (
                          <div className="border-t border-gray-100 pt-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              👤 Pelanggan Terhubung:
                            </p>
                            <p className="text-lg font-bold text-primary">{connectedCustomers.length} pelanggan</p>
                          </div>
                        )}

                        {/* GPS */}
                        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {odp.latitude.toFixed(6)}, {odp.longitude.toFixed(6)}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Customer Markers */}
            {showCustomers && filteredCustomers.map(customer => (
              customer.latitude && customer.longitude && (
                <Marker
                  key={`customer-${customer.id}`}
                  position={[customer.latitude, customer.longitude]}
                  icon={getCustomerIcon(customer)}
                >
                  <Popup maxWidth={340} className="custom-popup">
                    <div className="popup-card">
                      {/* Header with gradient based on status */}
                      {(() => {
                        const statusInfo = getStatusInfo(customer);
                        const StatusIcon = statusInfo.icon;
                        const gradientColors = customer.isOnline
                          ? 'from-green-500 to-green-600'
                          : customer.status === 'isolir'
                            ? 'from-orange-500 to-orange-600'
                            : customer.status === 'expired' || customer.status === 'suspended'
                              ? 'from-red-500 to-red-600'
                              : 'from-blue-500 to-blue-600';

                        return (
                          <div className={`popup-header bg-gradient-to-r ${gradientColors}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                  </svg>
                                </div>
                                <div>
                                  <span className="font-bold">Pelanggan</span>
                                  <p className="text-white/80 text-xs">{customer.username}</p>
                                </div>
                              </div>
                              <span className="flex items-center gap-1 px-2 py-1 bg-white/20 rounded text-xs font-medium">
                                <StatusIcon className="w-3 h-3" />
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Content */}
                      <div className="popup-content">
                        {/* Customer Name */}
                        <p className="font-bold text-foreground text-base mb-3">{customer.name || customer.fullName}</p>

                        {/* Contact Info */}
                        <div className="space-y-2 mb-3">
                          {customer.phone && (
                            <div className="flex items-center gap-2.5 text-sm">
                              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                                <Phone className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <span className="text-gray-700">{customer.phone}</span>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2.5 text-sm">
                              <div className="w-6 h-6 bg-accent/10 rounded flex items-center justify-center flex-shrink-0">
                                <Mail className="w-3.5 h-3.5 text-accent" />
                              </div>
                              <span className="text-gray-700 truncate text-xs">{customer.email}</span>
                            </div>
                          )}
                          {customer.address && (
                            <div className="flex items-start gap-2.5 text-sm">
                              <div className="w-6 h-6 bg-success/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                                <MapPinned className="w-3.5 h-3.5 text-success" />
                              </div>
                              <span className="text-gray-700 text-xs line-clamp-2">{customer.address}</span>
                            </div>
                          )}
                        </div>

                        {/* Package & Router */}
                        <div className="bg-gray-50 rounded-lg p-2.5 mb-3 border border-gray-100">
                          <div className="grid grid-cols-2 gap-2">
                            {customer.profile && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-0.5">Paket</p>
                                <p className="text-sm font-semibold text-foreground leading-tight">{customer.profile.name}</p>
                                <p className="text-xs text-success font-medium">{formatCurrency(customer.profile.price)}</p>
                              </div>
                            )}
                            {customer.router && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-0.5">Router</p>
                                <p className="text-sm font-semibold text-foreground leading-tight">{customer.router.shortname || customer.router.nasname}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Network Connection */}
                        {customer.odpAssignment && (
                          <div className="border-t border-gray-100 pt-3 mb-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Koneksi Jaringan</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-success/10 text-success rounded text-xs font-medium border border-success/30">
                                <Radio className="w-3 h-3" />
                                {customer.odpAssignment.odp.name}
                              </span>
                              <span className="text-muted-foreground text-xs">Port {customer.odpAssignment.portNumber}</span>
                            </div>
                          </div>
                        )}

                        {/* Technical Info */}
                        {(customer.ipAddress || customer.macAddress) && (
                          <div className="border-t border-gray-100 pt-3 mb-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Info Teknis</p>
                            <div className="flex flex-wrap gap-1.5">
                              {customer.ipAddress && (
                                <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-[11px] font-mono border border-gray-100">
                                  IP: {customer.ipAddress}
                                </span>
                              )}
                              {customer.macAddress && (
                                <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-[11px] font-mono border border-gray-100">
                                  MAC: {customer.macAddress}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Dates */}
                        <div className="border-t border-gray-100 pt-3 mb-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Terdaftar</p>
                            <p className="font-medium text-foreground text-xs">{formatDate(customer.createdAt)}</p>
                          </div>
                          {customer.expiredAt && (
                            <div>
                              <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Expired</p>
                              <p className="font-medium text-foreground text-xs">{formatDate(customer.expiredAt)}</p>
                            </div>
                          )}
                        </div>

                        {/* GPS */}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mb-3">
                          <MapPin className="w-3 h-3" />
                          {customer.latitude?.toFixed(6)}, {customer.longitude?.toFixed(6)}
                        </div>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium shadow-sm transition-all"
                        >
                          <Edit className="w-4 h-4" />
                          Edit Pelanggan
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>
        </div>

        {/* Legend */}
        <div className="bg-card rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Legenda</h3>
          <div className="flex flex-wrap gap-4 items-center">
            {/* Network Elements */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-red-500 to-red-600 border-2 border-white shadow flex items-center justify-center">
                <Server className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm text-muted-foreground">OLT</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-orange-500 to-orange-600 border-2 border-white shadow flex items-center justify-center">
                <Box className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm text-muted-foreground">ODC</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-green-500 to-green-600 border-2 border-white shadow flex items-center justify-center">
                <Radio className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm text-muted-foreground">ODP</span>
            </div>

            <div className="h-4 border-l border-border" />

            {/* Customer Status */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-green-500 to-green-600 border-2 border-white shadow flex items-center justify-center relative">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border border-white animate-pulse"></div>
              </div>
              <span className="text-sm text-muted-foreground">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-white shadow flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </div>
              <span className="text-sm text-muted-foreground">Offline</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-orange-400 to-orange-500 border-2 border-white shadow flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </div>
              <span className="text-sm text-muted-foreground">Isolir</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-red-400 to-red-500 border-2 border-white shadow flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              </div>
              <span className="text-sm text-muted-foreground">Nunggak</span>
            </div>

            <div className="h-4 border-l border-border" />

            {/* Cable Types */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-orange-400 rounded"></div>
              <span className="text-sm text-muted-foreground">OLT→ODC</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-success/100 rounded"></div>
              <span className="text-sm text-muted-foreground">ODC→ODP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-blue-400"></div>
              <span className="text-sm text-muted-foreground">ODP→Pelanggan</span>
            </div>
          </div>
        </div>

        {/* Edit Customer Modal */}
        {editingCustomer && (
          <UserDetailModal
            isOpen={editModalOpen}
            onClose={() => {
              setEditModalOpen(false);
              setEditingCustomer(null);
            }}
            user={{
              id: editingCustomer.id,
              username: editingCustomer.username,
              name: editingCustomer.name || editingCustomer.fullName || '',
              phone: editingCustomer.phone,
              email: editingCustomer.email,
              address: editingCustomer.address,
              status: editingCustomer.status,
              profile: editingCustomer.profile || { id: '', name: '' },
              router: editingCustomer.router ? { id: editingCustomer.router.id, name: editingCustomer.router.shortname || editingCustomer.router.nasname } : null,
              ipAddress: editingCustomer.ipAddress,
              expiredAt: editingCustomer.expiredAt,
              latitude: editingCustomer.latitude,
              longitude: editingCustomer.longitude,
            }}
            onSave={handleSaveCustomer}
            profiles={profiles}
            routers={routerList}
          />
        )}
      </div>
    </div>
  );
}
