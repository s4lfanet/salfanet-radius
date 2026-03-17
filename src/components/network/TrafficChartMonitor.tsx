'use client';

import { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, ArrowUp, ArrowDown } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface InterfaceTraffic {
  name: string;
  rxBytes: number;
  txBytes: number;
  rxRate: number;
  txRate: number;
  rxPackets: number;
  txPackets: number;
  running: boolean;
}

interface RouterTraffic {
  routerId: string;
  routerName: string;
  interfaces: InterfaceTraffic[];
  error?: string;
}

interface TrafficData {
  routers: RouterTraffic[];
  timestamp: string;
}

interface TrafficHistory {
  time: string;
  [key: string]: number | string; // interface-rx, interface-tx
}

interface PreviousData {
  [key: string]: {
    rxBytes: number;
    txBytes: number;
    timestamp: number;
  };
}

const MAX_HISTORY_POINTS = 20; // Keep last 20 data points (1 minute at 3s interval)

export default function TrafficChartMonitor() {
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousData, setPreviousData] = useState<PreviousData>({});
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [trafficHistory, setTrafficHistory] = useState<TrafficHistory[]>([]);
  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatBitrate = (bytesPerSecond: number): string => {
    const bitsPerSecond = bytesPerSecond * 8;
    if (bitsPerSecond === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bitsPerSecond) / Math.log(k));
    return `${(bitsPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatBitrateShort = (bytesPerSecond: number): number => {
    // Convert to Mbps for chart
    return parseFloat(((bytesPerSecond * 8) / 1000000).toFixed(2));
  };

  const calculateRate = (
    routerId: string,
    interfaceName: string,
    currentRx: number,
    currentTx: number,
    currentTime: number
  ): { rxRate: number; txRate: number } => {
    const key = `${routerId}-${interfaceName}`;
    const prev = previousData[key];

    if (!prev) {
      return { rxRate: 0, txRate: 0 };
    }

    const timeDiff = (currentTime - prev.timestamp) / 1000; // seconds
    if (timeDiff <= 0) {
      return { rxRate: 0, txRate: 0 };
    }

    const rxRate = (currentRx - prev.rxBytes) / timeDiff;
    const txRate = (currentTx - prev.txBytes) / timeDiff;

    return {
      rxRate: Math.max(0, rxRate),
      txRate: Math.max(0, txRate),
    };
  };

  const fetchTraffic = async () => {
    try {
      const response = await fetch('/api/dashboard/traffic');
      const data = await response.json();

      if (data.success) {
        const currentTime = Date.now();
        const newPreviousData: PreviousData = {};
        const timeLabel = formatWIB(new Date(), 'HH:mm:ss');

        // Calculate rates and update previous data
        data.routers.forEach((router: RouterTraffic) => {
          router.interfaces.forEach((iface) => {
            const key = `${router.routerId}-${iface.name}`;
            const rates = calculateRate(
              router.routerId,
              iface.name,
              iface.rxBytes,
              iface.txBytes,
              currentTime
            );

            iface.rxRate = rates.rxRate;
            iface.txRate = rates.txRate;

            newPreviousData[key] = {
              rxBytes: iface.rxBytes,
              txBytes: iface.txBytes,
              timestamp: currentTime,
            };
          });
        });

        setPreviousData(newPreviousData);
        setTraffic(data);
        setError(null);

        // Update available interfaces list - show ALL interfaces (not just running)
        const interfaces = new Set<string>();
        data.routers.forEach((router: RouterTraffic) => {
          router.interfaces.forEach((iface: InterfaceTraffic) => interfaces.add(iface.name));
        });
        setAvailableInterfaces(Array.from(interfaces).sort());

        // Update history for chart - only if interface is selected
        if (selectedInterface && selectedRouterId) {
          setTrafficHistory((prev) => {
            const newPoint: TrafficHistory = { time: timeLabel };
            
            // Find the selected router and interface (no running filter)
            const router = data.routers.find((r: RouterTraffic) => r.routerId === selectedRouterId);
            if (router) {
              const iface = router.interfaces.find((i: InterfaceTraffic) => i.name === selectedInterface);
              if (iface) {
                newPoint['Download'] = formatBitrateShort(iface.rxRate);
                newPoint['Upload'] = formatBitrateShort(iface.txRate);
              }
            }

            const updated = [...prev, newPoint].slice(-MAX_HISTORY_POINTS);
            return updated;
          });
        }
      } else {
        setError(data.message || 'Failed to fetch traffic data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraffic();
    const interval = setInterval(fetchTraffic, 3000); // Update every 3 seconds
    return () => clearInterval(interval);
  }, [selectedRouterId, selectedInterface]);

  // Reset history when filter changes
  useEffect(() => {
    setTrafficHistory([]);
  }, [selectedRouterId, selectedInterface]);

  const filteredRouters = selectedRouterId === 'all' 
    ? traffic?.routers || []
    : (traffic?.routers || []).filter(r => r.routerId === selectedRouterId);

  // Generate colors for interfaces
  const interfaceColors: { [key: string]: { download: string; upload: string } } = {};
  const colorPairs = [
    { download: '#3b82f6', upload: '#ef4444' }, // blue/red
    { download: '#10b981', upload: '#f59e0b' }, // green/orange
    { download: '#8b5cf6', upload: '#ec4899' }, // purple/pink
    { download: '#06b6d4', upload: '#f97316' }, // cyan/orange
    { download: '#14b8a6', upload: '#eab308' }, // teal/yellow
  ];

  availableInterfaces.forEach((iface, idx) => {
    interfaceColors[iface] = colorPairs[idx % colorPairs.length];
  });

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Traffic Monitor MikroTik
          </h3>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">Loading traffic data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-red-600 dark:text-red-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Traffic Monitor MikroTik
          </h3>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!traffic || traffic.routers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Traffic Monitor MikroTik
          </h3>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">No active routers found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Traffic Monitor MikroTik
          </h3>
        </div>
        
        <div className="flex flex-col items-start gap-2">
          {/* Router Selector */}
          <select
            value={selectedRouterId}
            onChange={(e) => {
              setSelectedRouterId(e.target.value);
              setSelectedInterface(''); // Reset interface when router changes
            }}
            className="text-[11px] px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Pilih Router --</option>
            {traffic.routers.map((router) => (
              <option key={router.routerId} value={router.routerId}>
                {router.routerName}
              </option>
            ))}
          </select>

          {/* Interface Selector */}
          <select
            value={selectedInterface}
            onChange={(e) => setSelectedInterface(e.target.value)}
            disabled={!selectedRouterId}
            className="text-[11px] px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">-- Pilih Interface --</option>
            {selectedRouterId && traffic.routers
              .find(r => r.routerId === selectedRouterId)
              ?.interfaces.map((iface) => (
                <option key={iface.name} value={iface.name}>
                  {iface.name} {!iface.running && '(Disabled)'}
                </option>
              ))}
          </select>
          
        </div>
      </div>

      {/* Traffic Chart */}
      {selectedInterface && selectedRouterId ? (
        trafficHistory.length > 0 ? (
          <div className="mb-6">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Bandwidth Real-Time: {selectedInterface} (Mbps)
              </h4>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trafficHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis 
                  dataKey="time" 
                  stroke="#9ca3af" 
                  style={{ fontSize: '11px' }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  style={{ fontSize: '11px' }}
                  label={{ value: 'Mbps', angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px' }}
                  iconType="line"
                />
                
                <Area
                  type="monotone"
                  dataKey="Download"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  name="Download"
                />
                <Area
                  type="monotone"
                  dataKey="Upload"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                  name="Upload"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        ) : (
          <div className="mb-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-pulse" />
              <p className="text-sm text-gray-500">Mengumpulkan data traffic...</p>
            </div>
          </div>
        )
      ) : (
        <div className="mb-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-8 border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">Pilih Router dan Interface untuk melihat grafik traffic</p>
          </div>
        </div>
      )}

      {/* Interface List - Only show if selected */}
      {selectedInterface && selectedRouterId && (
        <div className="space-y-6">
          {traffic.routers
            .filter(r => r.routerId === selectedRouterId)
            .map((router) => (
              <div key={router.routerId} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Detail Interface: {router.routerName}
                  </h4>
                  {router.error && (
                    <span className="text-xs text-red-600 dark:text-red-400">
                      {router.error}
                    </span>
                  )}
                </div>

                {router.interfaces.length === 0 ? (
                  <p className="text-xs text-gray-500">No interfaces found</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {router.interfaces
                      .filter((iface) => iface.name === selectedInterface && iface.running)
                  .map((iface) => (
                    <div
                      key={iface.name}
                      className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {iface.running ? (
                            <Wifi className="w-4 h-4 text-green-500" />
                          ) : (
                            <WifiOff className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {iface.name}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <ArrowDown className="w-3 h-3" />
                            <span className="font-medium">Download:</span>
                          </div>
                          <span className="font-semibold">{formatBitrate(iface.rxRate)}</span>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <ArrowUp className="w-3 h-3" />
                            <span className="font-medium">Upload:</span>
                          </div>
                          <span className="font-semibold">{formatBitrate(iface.txRate)}</span>
                        </div>

                        <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>Total RX: {formatBytes(iface.rxBytes)}</span>
                            <span>Total TX: {formatBytes(iface.txBytes)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Auto-refresh every 3 seconds • Showing last {MAX_HISTORY_POINTS * 3} seconds
        </p>
      </div>
    </div>
  );
}
