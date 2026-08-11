'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError } from '@/lib/sweetalert';
import {
  GitFork, Save, RefreshCcw, AlertCircle, Check, Cable
} from 'lucide-react';

interface SplitterPort {
  portNumber: number;
  inputCore?: { cableCode: string; tubeNumber: number; coreNumber: number; colorHex: string };
  outputCore?: { cableCode: string; tubeNumber: number; coreNumber: number; colorHex: string };
  assignedToType?: string;
  assignedToId?: string;
  status: 'available' | 'used' | 'reserved' | 'damaged';
}

interface SplitterConfig {
  splitterType: 'PLC' | 'FBT';
  ratio: string; // e.g., "1:8", "1:16", "1:32"
  inputLoss: number; // dB
  outputLoss: number; // dB per port
  wavelength: '1310' | '1490' | '1550';
  ports: SplitterPort[];
}

interface Props {
  deviceType: 'ODC' | 'ODP';
  deviceId: string;
  deviceName: string;
  currentConfig?: SplitterConfig | null;
  splitterRatio?: string;
  splitterType?: string;
  onConfigUpdate?: (config: SplitterConfig) => void;
  className?: string;
}

const SPLITTER_RATIOS = [
  { value: '1:2', ports: 2, plcLoss: 3.8, fbtLoss: 3.5 },
  { value: '1:4', ports: 4, plcLoss: 7.4, fbtLoss: 7.0 },
  { value: '1:8', ports: 8, plcLoss: 10.8, fbtLoss: 10.5 },
  { value: '1:16', ports: 16, plcLoss: 14.0, fbtLoss: 14.0 },
  { value: '1:32', ports: 32, plcLoss: 17.3, fbtLoss: 18.0 },
  { value: '1:64', ports: 64, plcLoss: 21.0, fbtLoss: 22.0 },
];

const SPLITTER_TYPES = [
  { value: 'PLC', label: 'PLC (Planar Lightwave Circuit)', description: 'Lebih stabil, loss merata' },
  { value: 'FBT', label: 'FBT (Fused Biconical Taper)', description: 'Lebih ekonomis, ratio kecil' },
];

export default function SplitterSection({ 
  deviceType, 
  deviceId, 
  deviceName,
  currentConfig,
  splitterRatio = '1:8',
  splitterType = 'PLC',
  onConfigUpdate,
  className = ''
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [config, setConfig] = useState<SplitterConfig>({
    splitterType: (splitterType as 'PLC' | 'FBT') || 'PLC',
    ratio: splitterRatio || '1:8',
    inputLoss: 0.5,
    outputLoss: 10.8,
    wavelength: '1310',
    ports: [],
  });

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      // Initialize with default ports based on ratio
      const ratioInfo = SPLITTER_RATIOS.find(r => r.value === splitterRatio) || SPLITTER_RATIOS[2];
      const defaultPorts: SplitterPort[] = Array.from({ length: ratioInfo.ports }, (_, i) => ({
        portNumber: i + 1,
        status: 'available' as const,
      }));
      setConfig(prev => ({
        ...prev,
        splitterType: (splitterType as 'PLC' | 'FBT') || 'PLC',
        ratio: splitterRatio,
        outputLoss: splitterType === 'PLC' ? ratioInfo.plcLoss : ratioInfo.fbtLoss,
        ports: defaultPorts,
      }));
    }
  }, [currentConfig, splitterRatio, splitterType]);

  const handleRatioChange = (newRatio: string) => {
    const ratioInfo = SPLITTER_RATIOS.find(r => r.value === newRatio);
    if (!ratioInfo) return;

    const newPorts: SplitterPort[] = Array.from({ length: ratioInfo.ports }, (_, i) => ({
      portNumber: i + 1,
      status: 'available' as const,
    }));

    setConfig(prev => ({
      ...prev,
      ratio: newRatio,
      outputLoss: prev.splitterType === 'PLC' ? ratioInfo.plcLoss : ratioInfo.fbtLoss,
      ports: newPorts,
    }));
  };

  const handleTypeChange = (newType: 'PLC' | 'FBT') => {
    const ratioInfo = SPLITTER_RATIOS.find(r => r.value === config.ratio);
    if (!ratioInfo) return;

    setConfig(prev => ({
      ...prev,
      splitterType: newType,
      outputLoss: newType === 'PLC' ? ratioInfo.plcLoss : ratioInfo.fbtLoss,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to database via API
      const endpoint = deviceType === 'ODC' 
        ? `/api/network/odcs/${deviceId}` 
        : `/api/network/odps/${deviceId}`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitterConfig: config,
          splitterRatio: config.ratio,
          splitterType: config.splitterType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal menyimpan');
      }

      showSuccess('Konfigurasi splitter berhasil disimpan');
      setIsEditMode(false);
      onConfigUpdate?.(config);
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || 'Gagal menyimpan konfigurasi');
    } finally {
      setSaving(false);
    }
  };

  const getPortStatusStyle = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-400 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'used':
        return 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'reserved':
        return 'bg-yellow-100 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'damaged':
        return 'bg-red-100 border-red-400 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-700 dark:bg-gray-800';
    }
  };

  const stats = {
    total: config.ports.length,
    available: config.ports.filter(p => p.status === 'available').length,
    used: config.ports.filter(p => p.status === 'used').length,
    damaged: config.ports.filter(p => p.status === 'damaged').length,
  };

  if (!deviceId) {
    return null;
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-orange-500" />
          <div>
            <h3 className="text-sm font-semibold">Splitter Configuration</h3>
            <p className="text-[10px] text-gray-500">Optical splitter di {deviceName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <button
                onClick={() => setIsEditMode(false)}
                className="px-2 py-1 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-800 flex items-center gap-4 text-[10px]">
        <span className="text-gray-500">
          Type: <b className="text-orange-600">{config.splitterType}</b>
        </span>
        <span className="text-gray-500">
          Ratio: <b className="text-orange-600">{config.ratio}</b>
        </span>
        <span className="text-gray-500">
          Output Loss: <b className="text-orange-600">{config.outputLoss} dB</b>
        </span>
        <span className="ml-auto text-gray-500">
          <span className="text-green-600">{stats.available}</span> tersedia / 
          <span className="text-blue-600 mx-1">{stats.used}</span> terpakai
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        {isEditMode ? (
          /* Edit Mode */
          <div className="space-y-4">
            {/* Type & Ratio Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium mb-2">Tipe Splitter</label>
                <div className="space-y-2">
                  {SPLITTER_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleTypeChange(type.value as 'PLC' | 'FBT')}
                      className={`w-full p-2 rounded-lg border-2 text-left transition-all ${
                        config.splitterType === type.value
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xs font-semibold">{type.value}</span>
                      <p className="text-[9px] text-gray-500">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-2">Rasio Split</label>
                <div className="grid grid-cols-2 gap-2">
                  {SPLITTER_RATIOS.map(ratio => (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => handleRatioChange(ratio.value)}
                      className={`p-2 rounded-lg border-2 text-center transition-all ${
                        config.ratio === ratio.value
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xs font-bold">{ratio.value}</span>
                      <p className="text-[9px] text-gray-500">{ratio.ports} port</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Loss Info */}
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-[10px] font-medium text-orange-700 dark:text-orange-400">
                  Estimasi Insertion Loss
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <p className="text-[9px] text-gray-500">Input Loss</p>
                  <p className="text-sm font-bold text-orange-600">{config.inputLoss} dB</p>
                </div>
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <p className="text-[9px] text-gray-500">Output Loss</p>
                  <p className="text-sm font-bold text-orange-600">{config.outputLoss} dB</p>
                </div>
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <p className="text-[9px] text-gray-500">Total Loss/Port</p>
                  <p className="text-sm font-bold text-red-600">
                    {(config.inputLoss + config.outputLoss).toFixed(1)} dB
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* View Mode - Port Grid */
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-medium text-gray-500">Output Ports</span>
              <div className="flex-1 border-t dark:border-gray-700"></div>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {config.ports.map((port) => (
                <div
                  key={port.portNumber}
                  className={`p-2 rounded-lg border-2 text-center transition-all cursor-default ${getPortStatusStyle(port.status)}`}
                  title={`Port ${port.portNumber}: ${port.status}${port.assignedToId ? ` - ${port.assignedToType} ${port.assignedToId}` : ''}`}
                >
                  <span className="text-xs font-bold">{port.portNumber}</span>
                  {port.status === 'used' && port.assignedToId && (
                    <p className="text-[8px] truncate">{port.assignedToType}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 pt-3 border-t dark:border-gray-700 flex flex-wrap gap-3 text-[9px]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-100 border border-green-400"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-100 border border-blue-400"></div>
                <span>Used</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-400"></div>
                <span>Reserved</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-100 border border-red-400"></div>
                <span>Damaged</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
