'use client';

import React, { useEffect, useState } from 'react';
import { JointClosureDiagram, JointClosureDiagramV2, ODCDiagram, ODPDiagram } from '@/components/network/SplitterDiagram';
import OTBDiagramV2 from '@/components/network/SplitterDiagram/OTBDiagramV2';
import { SplitterNode, Port } from '@/components/network/SplitterDiagram/types';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';

export default function NetworkDiagramsPage() {
  const [selectedTab, setSelectedTab] = React.useState<'otb' | 'jc' | 'odc' | 'odp'>('otb');
  const [selectedPort, setSelectedPort] = React.useState<Port | null>(null);
  const { t } = useTranslation();

  // State for real data
  const [loading, setLoading] = useState(true);
  const [otbList, setOtbList] = useState<any[]>([]);
  const [jcList, setJcList] = useState<any[]>([]);
  const [odcList, setOdcList] = useState<any[]>([]);
  const [odpList, setOdpList] = useState<any[]>([]);
  const [selectedOTB, setSelectedOTB] = useState<string>('');
  const [selectedJC, setSelectedJC] = useState<string>('');
  const [selectedODC, setSelectedODC] = useState<string>('');
  const [selectedODP, setSelectedODP] = useState<string>('');

  // OTB enriched detail (with incomingCable + outputSegments)
  const [otbDetail, setOtbDetail] = useState<any | null>(null);
  const [otbDetailLoading, setOtbDetailLoading] = useState(false);

  // OTB tube→JC assignment form state
  const [jcListAll, setJcListAll] = useState<any[]>([]);
  const [assignTube, setAssignTube] = useState('');
  const [assignJc, setAssignJc] = useState('');
  const [assignLength, setAssignLength] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  // JC enriched detail (with inputSegments + outputSegments + splicePoints)
  const [jcDetail, setJcDetail] = useState<any | null>(null);
  const [jcDetailLoading, setJcDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [otbRes, jcRes, odcRes, odpRes] = await Promise.all([
        fetch('/api/network/otbs?limit=100'),
        fetch('/api/network/joint-closures'),
        fetch('/api/network/odcs'),
        fetch('/api/network/odps'),
      ]);

      const [otbData, jcData, odcData, odpData] = await Promise.all([
        otbRes.json(),
        jcRes.json(),
        odcRes.json(),
        odpRes.json(),
      ]);

      if (otbData.otbs) {
        setOtbList(otbData.otbs);
        if (otbData.otbs.length > 0) setSelectedOTB(otbData.otbs[0].id);
      }

      if (jcData.success && jcData.data) {
        setJcList(jcData.data);
        setJcListAll(jcData.data);
        if (jcData.data.length > 0) setSelectedJC(jcData.data[0].id);
      }

      if (odcData.odcs) {
        setOdcList(odcData.odcs);
        if (odcData.odcs.length > 0) setSelectedODC(odcData.odcs[0].id);
      }

      if (odpData.odps) {
        setOdpList(odpData.odps);
        if (odpData.odps.length > 0) setSelectedODP(odpData.odps[0].id);
      }
    } catch (error) {
      console.error('Failed to load network data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch enriched OTB detail whenever selectedOTB changes
  useEffect(() => {
    if (!selectedOTB) return;
    setOtbDetail(null);
    setOtbDetailLoading(true);
    fetch(`/api/network/otbs/${selectedOTB}`)
      .then(r => r.json())
      .then(d => setOtbDetail(d))
      .catch(console.error)
      .finally(() => setOtbDetailLoading(false));
  }, [selectedOTB]);

  // Fetch enriched JC detail whenever selectedJC changes
  useEffect(() => {
    if (!selectedJC) return;
    setJcDetail(null);
    setJcDetailLoading(true);
    fetch(`/api/network/joint-closures/${selectedJC}`)
      .then(r => r.json())
      .then(d => setJcDetail(d.data ?? d))
      .catch(console.error)
      .finally(() => setJcDetailLoading(false));
  }, [selectedJC]);

  // Save a tube→JC assignment
  const handleAssignTube = async () => {
    if (!assignTube || !assignJc || !selectedOTB) return;
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/network/otbs/${selectedOTB}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tubeNumber: parseInt(assignTube), jcId: assignJc, lengthMeters: assignLength || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
      // Re-fetch enriched OTB
      const refreshed = await fetch(`/api/network/otbs/${selectedOTB}`).then(r => r.json());
      setOtbDetail(refreshed);
      setAssignTube('');
      setAssignJc('');
      setAssignLength('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAssignSaving(false);
    }
  };

  // Remove a tube→JC assignment
  const handleRemoveSegment = async (segmentId: string) => {
    if (!confirm('Hapus penugasan tabung ini?')) return;
    try {
      const res = await fetch(`/api/network/otbs/${selectedOTB}/segments?segmentId=${segmentId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const refreshed = await fetch(`/api/network/otbs/${selectedOTB}`).then(r => r.json());
      setOtbDetail(refreshed);
    } catch (err: any) { alert(err.message); }
  };

  // Transform JC data to SplitterNode format
  const getCurrentJC = (): SplitterNode | null => {
    const jc = jcList.find(j => j.id === selectedJC);
    if (!jc) return null;

    return {
      id: jc.id,
      code: jc.code,
      name: jc.name,
      type: 'JOINT_CLOSURE',
      latitude: jc.latitude?.toString() || '0',
      longitude: jc.longitude?.toString() || '0',
      address: jc.address || '',
      inputPorts: jc.hasSplitter ? 2 : 1,
      outputPorts: jc.fiberCount || 16,
      splittingRatio: jc.splitterRatio || `1:${jc.fiberCount || 16}`,
      fiberCount: jc.fiberCount || 0,
      ports: jc.metadata?.ports || [],
      connections: jc.connections || [],
      status: jc.status.toUpperCase(),
      installDate: jc.installDate ? new Date(jc.installDate) : undefined,
    };
  };

  // Transform ODC data to SplitterNode format
  const getCurrentODC = (): SplitterNode | null => {
    const odc = odcList.find(o => o.id === selectedODC);
    if (!odc) return null;

    return {
      id: odc.id,
      code: `ODC-${odc.id.substring(0, 8)}`,
      name: odc.name,
      type: 'ODC',
      latitude: odc.latitude?.toString() || '0',
      longitude: odc.longitude?.toString() || '0',
      address: '',
      inputPorts: 1,
      outputPorts: odc.portCount || 8,
      splittingRatio: `1:${odc.portCount || 8}`,
      upstreamNode: odc.olt ? {
        id: odc.olt.id,
        type: 'OLT',
        code: odc.olt.name,
      } : undefined,
      ports: [],
      connections: [],
      status: odc.status.toUpperCase(),
    };
  };

  // Transform ODP data to SplitterNode format
  const getCurrentODP = (): SplitterNode | null => {
    const odp = odpList.find(o => o.id === selectedODP);
    if (!odp) return null;

    return {
      id: odp.id,
      code: odp.code || `ODP-${odp.id.substring(0, 8)}`,
      name: odp.name || 'ODP',
      type: 'ODP',
      latitude: odp.latitude?.toString() || '0',
      longitude: odp.longitude?.toString() || '0',
      address: '',
      inputPorts: 1,
      outputPorts: odp.portCount || 8,
      splittingRatio: `1:${odp.portCount || 8}`,
      upstreamNode: odp.odc ? {
        id: odp.odc.id,
        type: 'ODC',
        code: odp.odc.name,
      } : undefined,
      ports: [],
      connections: [],
      status: odp.status.toUpperCase(),
    };
  };

  // Sample JC data
  const sampleJC: SplitterNode = {
    id: 'jc-001',
    code: 'JC-GATSU-001',
    name: 'Joint Closure Gatot Subroto 001',
    type: 'JOINT_CLOSURE',
    latitude: '-8.670458',
    longitude: '115.212629',
    address: 'Jl. Gatot Subroto, Denpasar',
    inputPorts: 2,
    outputPorts: 16,
    splittingRatio: '2:16',
    upstreamNode: {
      id: 'olt-001',
      type: 'OLT',
      code: 'OLT-RENON-01',
    },
    ports: [
      { id: 'jc1-in1', number: 1, status: 'ASSIGNED', assignedTo: 'OLT-RENON-01 Port 4' },
      { id: 'jc1-in2', number: 2, status: 'ASSIGNED', assignedTo: 'OLT-RENON-01 Port 5' },
      { id: 'jc1-out1', number: 3, status: 'ASSIGNED', assignedTo: 'ODC-GATSU-001' },
      { id: 'jc1-out2', number: 4, status: 'ASSIGNED', assignedTo: 'ODC-GATSU-002' },
      { id: 'jc1-out3', number: 5, status: 'ASSIGNED', assignedTo: 'ODC-GATSU-003' },
      { id: 'jc1-out4', number: 6, status: 'RESERVED', assignedTo: 'Future Expansion' },
      { id: 'jc1-out5', number: 7, status: 'AVAILABLE' },
      { id: 'jc1-out6', number: 8, status: 'AVAILABLE' },
      { id: 'jc1-out7', number: 9, status: 'AVAILABLE' },
      { id: 'jc1-out8', number: 10, status: 'AVAILABLE' },
      { id: 'jc1-out9', number: 11, status: 'DAMAGED', notes: 'Fiber cut, need repair' },
      { id: 'jc1-out10', number: 12, status: 'AVAILABLE' },
      { id: 'jc1-out11', number: 13, status: 'AVAILABLE' },
      { id: 'jc1-out12', number: 14, status: 'AVAILABLE' },
      { id: 'jc1-out13', number: 15, status: 'MAINTENANCE' },
      { id: 'jc1-out14', number: 16, status: 'AVAILABLE' },
      { id: 'jc1-out15', number: 17, status: 'AVAILABLE' },
      { id: 'jc1-out16', number: 18, status: 'AVAILABLE' },
    ],
    connections: [
      { from: '1', to: 'ODC-GATSU-001', type: 'DOWNSTREAM', length: 150 },
      { from: '2', to: 'ODC-GATSU-002', type: 'DOWNSTREAM', length: 220 },
      { from: '3', to: 'ODC-GATSU-003', type: 'DOWNSTREAM', length: 180 },
    ],
    status: 'ACTIVE',
    installDate: new Date('2023-06-15'),
  };

  // Sample ODC data
  const sampleODC: SplitterNode = {
    id: 'odc-001',
    code: 'ODC-GATSU-001',
    name: 'ODC Gatot Subroto 001',
    type: 'ODC',
    latitude: '-8.671234',
    longitude: '115.213456',
    address: 'Jl. Gatot Subroto No. 45, Denpasar',
    inputPorts: 1,
    outputPorts: 16,
    splittingRatio: '1:16',
    upstreamNode: {
      id: 'jc-001',
      type: 'JOINT_CLOSURE',
      code: 'JC-GATSU-001',
    },
    ports: [
      { id: 'odc1-in1', number: 1, status: 'ASSIGNED', assignedTo: 'JC-GATSU-001 Port 3' },
      { id: 'odc1-out1', number: 2, status: 'ASSIGNED', assignedTo: 'ODP-GATSU-001A', signalStrength: -22 },
      { id: 'odc1-out2', number: 3, status: 'ASSIGNED', assignedTo: 'ODP-GATSU-001B', signalStrength: -24 },
      { id: 'odc1-out3', number: 4, status: 'ASSIGNED', assignedTo: 'ODP-GATSU-001C', signalStrength: -23 },
      { id: 'odc1-out4', number: 5, status: 'ASSIGNED', assignedTo: 'ODP-GATSU-001D', signalStrength: -25 },
      { id: 'odc1-out5', number: 6, status: 'ASSIGNED', assignedTo: 'ODP-GATSU-001E', signalStrength: -21 },
      { id: 'odc1-out6', number: 7, status: 'RESERVED', assignedTo: 'Future Zone F' },
      { id: 'odc1-out7', number: 8, status: 'AVAILABLE' },
      { id: 'odc1-out8', number: 9, status: 'AVAILABLE' },
      { id: 'odc1-out9', number: 10, status: 'AVAILABLE' },
      { id: 'odc1-out10', number: 11, status: 'AVAILABLE' },
      { id: 'odc1-out11', number: 12, status: 'AVAILABLE' },
      { id: 'odc1-out12', number: 13, status: 'AVAILABLE' },
      { id: 'odc1-out13', number: 14, status: 'AVAILABLE' },
      { id: 'odc1-out14', number: 15, status: 'AVAILABLE' },
      { id: 'odc1-out15', number: 16, status: 'DAMAGED', notes: 'Connector broken' },
      { id: 'odc1-out16', number: 17, status: 'AVAILABLE' },
    ],
    connections: [],
    status: 'ACTIVE',
    installDate: new Date('2023-07-20'),
  };

  // Sample ODP data
  const sampleODP: SplitterNode = {
    id: 'odp-001',
    code: 'ODP-GATSU-001A',
    name: 'ODP Gatot Subroto Zone A',
    type: 'ODP',
    latitude: '-8.672345',
    longitude: '115.214567',
    address: 'Jl. Gatot Subroto Gang Mawar, Denpasar',
    inputPorts: 1,
    outputPorts: 8,
    splittingRatio: '1:8',
    upstreamNode: {
      id: 'odc-001',
      type: 'ODC',
      code: 'ODC-GATSU-001',
    },
    ports: [
      { id: 'odp1-in1', number: 1, status: 'ASSIGNED', assignedTo: 'ODC-GATSU-001 Port 2' },
      { id: 'odp1-c1', number: 2, status: 'ASSIGNED', assignedTo: 'Budi Santoso', signalStrength: -23 },
      { id: 'odp1-c2', number: 3, status: 'ASSIGNED', assignedTo: 'Ani Wijaya', signalStrength: -24 },
      { id: 'odp1-c3', number: 4, status: 'ASSIGNED', assignedTo: 'Citra Dewi', signalStrength: -22 },
      { id: 'odp1-c4', number: 5, status: 'ASSIGNED', assignedTo: 'Dedi Kurnia', signalStrength: -25 },
      { id: 'odp1-c5', number: 6, status: 'ASSIGNED', assignedTo: 'Eka Putri', signalStrength: -21 },
      { id: 'odp1-c6', number: 7, status: 'RESERVED', assignedTo: 'New Customer' },
      { id: 'odp1-c7', number: 8, status: 'AVAILABLE' },
      { id: 'odp1-c8', number: 9, status: 'DAMAGED', notes: 'Fiber damaged, customer complained' },
    ],
    connections: [],
    status: 'ACTIVE',
    installDate: new Date('2023-08-10'),
  };

  const handlePortClick = (port: Port) => {
    setSelectedPort(port);
    console.log('Port clicked:', port);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-900 dark:text-white">{t('common.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  const currentJC = getCurrentJC();
  const currentODC = getCurrentODC();
  const currentODP = getCurrentODP();

  const hasNoData = otbList.length === 0 && jcList.length === 0 && odcList.length === 0 && odpList.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('network.diagram.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('network.diagram.description')}
          </p>
        </div>

        {/* Empty State */}
        {hasNoData && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-gray-600 dark:text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-300 mb-2">{t('network.diagram.noData')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-500 mb-6">
                {t('network.diagram.noDataDescription')}
              </p>
              <div className="flex gap-4 justify-center">
                <Link
                  href="/admin/network/fiber-joint-closures"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {t('network.diagram.addJointClosure')}
                </Link>
                <Link
                  href="/admin/network/fiber-odcs"
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                >
                  {t('network.diagram.addODC')}
                </Link>
                <Link
                  href="/admin/network/fiber-odps"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  {t('network.diagram.addODP')}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {!hasNoData && (
          <>
            {/* Tab Navigation */}
            <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setSelectedTab('otb')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    selectedTab === 'otb'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  OTB ({otbList.length})
                </button>
                <button
                  onClick={() => setSelectedTab('jc')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    selectedTab === 'jc'
                      ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {t('network.jointClosure.title')} ({jcList.length})
                </button>
                <button
                  onClick={() => setSelectedTab('odc')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    selectedTab === 'odc'
                      ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {t('network.odc.title')} ({odcList.length})
                </button>
                <button
                  onClick={() => setSelectedTab('odp')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    selectedTab === 'odp'
                      ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {t('network.odp.title')} ({odpList.length})
                </button>
              </nav>
            </div>

            {/* Selector + Diagram */}
            <div className="space-y-4">
              {/* ── OTB Tab ─────────────────────────────────────────────── */}
              {selectedTab === 'otb' && (
                <>
                  {otbList.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">Belum ada OTB yang terdaftar.</p>
                      <Link
                        href="/admin/network/map"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-block"
                      >
                        Tambah OTB di Peta
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                      {/* Left: selector + diagram */}
                      <div className="xl:col-span-2 space-y-4">
                        <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                          <label className="text-gray-900 dark:text-gray-300 font-medium whitespace-nowrap">Pilih OTB:</label>
                          <select
                            value={selectedOTB}
                            onChange={e => setSelectedOTB(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          >
                            {otbList.map(o => (
                              <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                            ))}
                          </select>
                        </div>

                        {otbDetailLoading && (
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">Memuat data OTB...</p>
                          </div>
                        )}

                        {!otbDetailLoading && otbDetail && (
                          <OTBDiagramV2
                            node={{
                              id: otbDetail.id,
                              code: otbDetail.code,
                              name: otbDetail.name,
                              type: 'OTB',
                              latitude: String(otbDetail.latitude ?? 0),
                              longitude: String(otbDetail.longitude ?? 0),
                              address: otbDetail.address || '',
                              inputPorts: 1,
                              outputPorts: otbDetail.portCount || 24,
                              splittingRatio: 'Patch-through',
                              ports: [],
                              connections: [],
                              status: (otbDetail.status || 'ACTIVE').toUpperCase(),
                              hasSplitter: false,
                              spliceTrayCount: otbDetail.spliceTrayCount ?? 1,
                              upstreamNode: otbDetail.network_olts
                                ? { id: otbDetail.network_olts.id, type: 'OLT' as const, code: otbDetail.network_olts.name }
                                : undefined,
                              metadata: {
                                feederCableAssignments: otbDetail.feederCableAssignments ?? [],
                                outputSegments: otbDetail.outputSegments ?? [],
                              },
                              incomingCable: otbDetail.incomingCable
                                ? {
                                    id: otbDetail.incomingCable.id,
                                    code: otbDetail.incomingCable.code,
                                    name: otbDetail.incomingCable.name,
                                    cableType: otbDetail.incomingCable.cableType,
                                    tubeCount: otbDetail.incomingCable.tubeCount,
                                    coresPerTube: otbDetail.incomingCable.coresPerTube,
                                    tubes: (otbDetail.incomingCable.tubes ?? []).map((tube: any) => {
                                      const coresList = (tube.cores ?? []).map((core: any) => ({
                                        id: core.id,
                                        coreNumber: core.coreNumber,
                                        colorCode: core.colorCode || '',
                                        colorHex: core.colorHex || '',
                                        status: core.status ?? 'AVAILABLE',
                                        assignedToType: core.assignedToType,
                                        assignedToId: core.assignedToId,
                                      }));
                                      return {
                                        id: tube.id,
                                        tubeNumber: tube.tubeNumber,
                                        colorCode: tube.colorCode || '',
                                        colorHex: tube.colorHex || '',
                                        totalCores: coresList.length || tube.coreCount || 0,
                                        usedCores: coresList.filter((c: any) => c.status !== 'AVAILABLE').length,
                                        cores: coresList,
                                      };
                                    }),
                                  }
                                : undefined,
                            }}
                            showTubeDetail
                          />
                        )}

                        {!otbDetailLoading && otbDetail && !otbDetail.incomingCable && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-300">
                            OTB ini belum terhubung ke kabel feeder. Edit OTB dan pilih kabel feeder dari daftar fiber cables.
                          </div>
                        )}
                      </div>

                      {/* Right: tube→JC assignment panel */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Penugasan Tabung → JC</h3>

                        {/* Assignment table */}
                        {otbDetail?.outputSegments?.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                  <th className="text-left pb-2 text-gray-500 dark:text-gray-400">Tabung</th>
                                  <th className="text-left pb-2 text-gray-500 dark:text-gray-400">JC</th>
                                  <th className="text-left pb-2 text-gray-500 dark:text-gray-400">Status</th>
                                  <th className="pb-2" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {otbDetail.outputSegments.map((seg: any) => (
                                  <tr key={seg.id}>
                                    <td className="py-1.5 font-mono text-gray-700 dark:text-gray-300">T{seg.fromPort}</td>
                                    <td className="py-1.5 text-gray-700 dark:text-gray-300">
                                      {seg.toDevice ? seg.toDevice.name : seg.toDeviceId}
                                    </td>
                                    <td className="py-1.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        seg.status === 'ACTIVE'
                                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                          : seg.status === 'DAMAGED'
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                      }`}>{seg.status}</span>
                                    </td>
                                    <td className="py-1.5 text-right">
                                      <button
                                        onClick={() => handleRemoveSegment(seg.id)}
                                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                                        title="Hapus penugasan"
                                      >✕</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500">Belum ada tabung yang ditugaskan ke JC.</p>
                        )}

                        {/* Add assignment form */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Tugaskan Tabung ke JC</p>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              value={assignTube}
                              onChange={e => setAssignTube(e.target.value)}
                              placeholder="No. Tabung"
                              className="w-24 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <select
                              value={assignJc}
                              onChange={e => setAssignJc(e.target.value)}
                              className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">— Pilih JC —</option>
                              {jcListAll.map(j => (
                                <option key={j.id} value={j.id}>{j.name}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={assignLength}
                            onChange={e => setAssignLength(e.target.value)}
                            placeholder="Panjang kabel (meter, opsional)"
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <button
                            onClick={handleAssignTube}
                            disabled={!assignTube || !assignJc || assignSaving}
                            className="w-full py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors"
                          >
                            {assignSaving ? 'Menyimpan...' : 'Simpan Penugasan'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* JC Tab */}
              {selectedTab === 'jc' && (
                <>
                  {jcList.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{t('network.diagram.noJointClosures')}</p>
                      <Link
                        href="/admin/network/fiber-joint-closures"
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors inline-block"
                      >
                        {t('network.diagram.addJointClosure')}
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                      {/* Left col: selector + diagram */}
                      <div className="xl:col-span-2 space-y-4">
                        <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                          <label className="text-gray-900 dark:text-gray-300 font-medium whitespace-nowrap">{t('network.diagram.selectJointClosure')}:</label>
                          <select
                            value={selectedJC}
                            onChange={e => setSelectedJC(e.target.value)}
                            className="flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            {jcList.map(jc => (
                              <option key={jc.id} value={jc.id}>{jc.code} — {jc.name}</option>
                            ))}
                          </select>
                        </div>

                        {jcDetailLoading && (
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">Memuat data JC...</p>
                          </div>
                        )}

                        {!jcDetailLoading && jcDetail && (() => {
                          // Group input segments by cable ID to avoid duplicates (tubes from same cable)
                          const inputCableMap = new Map<string, any>();
                          for (const seg of (jcDetail.inputSegments ?? [])) {
                            const cableId = seg.fiber_cables?.id ?? seg.cableId;
                            if (!inputCableMap.has(cableId)) {
                              inputCableMap.set(cableId, {
                                id: cableId,
                                cableCode: seg.fiber_cables?.code ?? seg.cableId,
                                cableName: seg.fiber_cables?.name,
                                direction: 'UPSTREAM' as const,
                                tubeCount: seg.fiber_cables?.tubeCount ?? 1,
                                coresPerTube: seg.fiber_cables?.coresPerTube ?? 12,
                                tubeNumbers: [] as number[],
                              });
                            }
                            if (seg.fromPort) inputCableMap.get(cableId).tubeNumbers.push(seg.fromPort);
                          }
                          // Group output segments by cable ID
                          const outputCableMap = new Map<string, any>();
                          for (const seg of (jcDetail.outputSegments ?? [])) {
                            const cableId = seg.fiber_cables?.id ?? seg.cableId;
                            if (!outputCableMap.has(cableId)) {
                              outputCableMap.set(cableId, {
                                id: cableId,
                                cableCode: seg.fiber_cables?.code ?? seg.cableId,
                                cableName: seg.fiber_cables?.name,
                                direction: 'DOWNSTREAM' as const,
                                tubeCount: seg.fiber_cables?.tubeCount ?? 1,
                                coresPerTube: seg.fiber_cables?.coresPerTube ?? 12,
                              });
                            }
                          }
                          const cables = [...inputCableMap.values(), ...outputCableMap.values()];
                          // Build splices[] for JointClosureDiagramV2
                          const splices = (jcDetail.splicePoints ?? []).map((sp: any) => ({
                            id: sp.id,
                            fromTube: sp.incomingCore?.tube?.tubeNumber ?? 1,
                            fromCore: sp.incomingCore?.coreNumber ?? 1,
                            fromCable: sp.incomingCore?.tube?.cable?.code ?? '',
                            toTube: sp.outgoingCore?.tube?.tubeNumber ?? 1,
                            toCore: sp.outgoingCore?.coreNumber ?? 1,
                            toCable: sp.outgoingCore?.tube?.cable?.code ?? '',
                            spliceType: sp.spliceType ?? 'FUSION',
                            insertionLoss: sp.insertionLoss,
                            status: ((sp.status === 'REPAIRED' ? 'ACTIVE' : sp.status) ?? 'ACTIVE') as 'ACTIVE' | 'DAMAGED' | 'PENDING',
                          }));
                          return (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                              <JointClosureDiagramV2
                                node={{
                                  id: jcDetail.id,
                                  code: jcDetail.code,
                                  name: jcDetail.name,
                                  type: 'JOINT_CLOSURE',
                                  latitude: String(jcDetail.latitude ?? 0),
                                  longitude: String(jcDetail.longitude ?? 0),
                                  address: jcDetail.address || '',
                                  inputPorts: 1,
                                  outputPorts: jcDetail.fiberCount || 16,
                                  splittingRatio: `1:${jcDetail.fiberCount || 16}`,
                                  ports: [],
                                  connections: jcDetail.connections || [],
                                  status: (jcDetail.status || 'active').toUpperCase(),
                                  closureType: jcDetail.closureType,
                                  spliceTrayCount: jcDetail.spliceTrayCount,
                                  cables,
                                  splices,
                                }}
                                showSpliceDetail
                              />
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right col: input/output segments info */}
                      <div className="space-y-4">
                        {/* Input segments — grouped by cable */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Kabel Masuk (dari OTB)</h3>
                          {(jcDetail?.inputSegments?.length ?? 0) === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">Belum ada kabel yang masuk.</p>
                          ) : (() => {
                            // Group by cable
                            const grouped = new Map<string, { cable: any; segments: any[] }>();
                            for (const seg of jcDetail.inputSegments) {
                              const cid = seg.fiber_cables?.id ?? seg.cableId;
                              if (!grouped.has(cid)) grouped.set(cid, { cable: seg.fiber_cables, segments: [] });
                              grouped.get(cid)!.segments.push(seg);
                            }
                            return (
                              <div className="space-y-2">
                                {[...grouped.entries()].map(([cid, { cable, segments }]) => {
                                  const tubeNums = segments.map((s: any) => s.fromPort).filter(Boolean).sort((a: number, b: number) => a - b);
                                   const tubes = cable?.tubeCount ?? (tubeNums.length || 1);
                                  const cores = cable?.coresPerTube ?? 12;
                                  const fromDevice = segments[0]?.fromDevice;
                                  return (
                                    <div key={cid} className="text-xs border border-purple-100 dark:border-purple-900/30 rounded p-2 bg-purple-50 dark:bg-purple-900/10">
                                      <p className="font-medium text-purple-700 dark:text-purple-300">
                                        {cable?.name ?? cid}
                                      </p>
                                      <p className="text-gray-500 dark:text-gray-400">
                                        {tubes}T × {cores}C = {tubes * cores} core
                                      </p>
                                      {tubeNums.length > 0 && (
                                        <p className="text-gray-400 dark:text-gray-500">
                                          Tabung: {tubeNums.map((n: number) => `T${n}`).join(', ')}
                                        </p>
                                      )}
                                      <p className="text-gray-400 dark:text-gray-500">
                                        Dari: {fromDevice ? `${fromDevice.name} (OTB)` : segments[0]?.fromDeviceId}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Output segments — grouped by cable */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Kabel Keluar (ke JC/ODC/ODP)</h3>
                          {(jcDetail?.outputSegments?.length ?? 0) === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500">Belum ada kabel yang keluar.</p>
                          ) : (() => {
                            const grouped = new Map<string, { cable: any; segments: any[] }>();
                            for (const seg of jcDetail.outputSegments) {
                              const cid = seg.fiber_cables?.id ?? seg.cableId;
                              if (!grouped.has(cid)) grouped.set(cid, { cable: seg.fiber_cables, segments: [] });
                              grouped.get(cid)!.segments.push(seg);
                            }
                            return (
                              <div className="space-y-2">
                                {[...grouped.entries()].map(([cid, { cable, segments }]) => {
                                  const tubes = cable?.tubeCount ?? 1;
                                  const cores = cable?.coresPerTube ?? 12;
                                  const toDevice = segments[0]?.toDevice;
                                  return (
                                    <div key={cid} className="text-xs border border-cyan-100 dark:border-cyan-900/30 rounded p-2 bg-cyan-50 dark:bg-cyan-900/10">
                                      <p className="font-medium text-cyan-700 dark:text-cyan-300">
                                        {cable?.name ?? cid}
                                      </p>
                                      <p className="text-gray-500 dark:text-gray-400">
                                        {tubes}T × {cores}C = {tubes * cores} core
                                      </p>
                                      <p className="text-gray-400 dark:text-gray-500">
                                        Ke: {toDevice ? `${toDevice.name} (${segments[0]?.toDeviceType})` : segments[0]?.toDeviceId}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Splice summary */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">Splice Points</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {jcDetail?.splicePoints?.length ?? 0} sambungan tersimpan
                          </p>
                          {(jcDetail?.spliceTrayCount ?? 0) > 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              Tray: {jcDetail.spliceTrayCount} | Kapasitas: {jcDetail.totalSpliceCapacity}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ODC Tab */}
              {selectedTab === 'odc' && (
                <>
                  {odcList.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{t('network.diagram.noODCs')}</p>
                      <Link
                        href="/admin/network/fiber-odcs"
                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors inline-block"
                      >
                        {t('network.diagram.addODC')}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <label className="text-gray-900 dark:text-gray-300 font-medium">{t('network.diagram.selectODC')}:</label>
                        <select
                          value={selectedODC}
                          onChange={(e) => setSelectedODC(e.target.value)}
                          className="flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          {odcList.map((odc) => (
                            <option key={odc.id} value={odc.id}>
                              {odc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                        {currentODC && (
                          <ODCDiagram
                            node={currentODC}
                            width={700}
                            height={500}
                            interactive={true}
                            showLabels={true}
                            onPortClick={handlePortClick}
                          />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ODP Tab */}
              {selectedTab === 'odp' && (
                <>
                  {odpList.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{t('network.diagram.noODPs')}</p>
                      <Link
                        href="/admin/network/fiber-odps"
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors inline-block"
                      >
                        {t('network.diagram.addODP')}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <label className="text-gray-900 dark:text-gray-300 font-medium">{t('network.diagram.selectODP')}:</label>
                        <select
                          value={selectedODP}
                          onChange={(e) => setSelectedODP(e.target.value)}
                          className="flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {odpList.map((odp) => (
                            <option key={odp.id} value={odp.id}>
                              {odp.code || odp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                        {currentODP && (
                          <ODPDiagram
                            node={currentODP}
                            width={700}
                            height={500}
                            interactive={true}
                            showLabels={true}
                            onPortClick={handlePortClick}
                          />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
