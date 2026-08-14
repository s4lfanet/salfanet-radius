'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Network, Activity, Layers, Link2, Unlink } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalButton,
  ModalLabel,
} from '@/components/cyberpunk';
import { apiAdmin } from '@/lib/api';

const API_BASE = '/api/admin/ippool';

interface Pool {
  pool_name: string;
  total_ips: number;
  start_ip: string;
  end_ip: string;
}

interface PoolMapping {
  id: number;
  groupname: string;
  pool_name: string;
}

interface PoolDetails {
  pool_name: string;
  total_ips: number;
  allocated: number;
  free: number;
  recent_allocations: Array<{
    framedipaddress: string;
    username: string;
    callingstationid: string;
    nasipaddress: string;
    expiry_time: string;
  }>;
}

interface PoolStats {
  total_pools: number;
  total_ips: number;
  allocated_ips: number;
  free_ips: number;
  utilization: string;
}

export default function IPPoolPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [mappings, setMappings] = useState<PoolMapping[]>([]);
  const [details, setDetails] = useState<PoolDetails | null>(null);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExpandOpen, setIsExpandOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [formData, setFormData] = useState({ pool_name: '', network: '', start: '2', end: '254' });
  const [expandData, setExpandData] = useState({ pool_name: '', network: '', start: '2', end: '254' });
  const [mapData, setMapData] = useState({ groupname: '', pool_name: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [poolsData, statsData, mapData] = await Promise.all([
        apiAdmin(`${API_BASE}`),
        apiAdmin(`${API_BASE}/stats`),
        apiAdmin(`${API_BASE}/mappings/list`),
      ]);
      setPools((poolsData as any).data || []);
      setStats((statsData as any).data || null);
      setMappings((mapData as any).data || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load IP pool data');
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (poolName: string) => {
    try {
      const data = await apiAdmin(`${API_BASE}/${encodeURIComponent(poolName)}`);
      setDetails((data as any).data || null);
      setSelectedPool(poolName);
    } catch (err: any) {
      showError('Failed to load pool details');
    }
  };

  const handleCreate = async () => {
    if (!formData.pool_name || !formData.network) {
      showError('Pool name and network are required');
      return;
    }
    try {
      const data = await apiAdmin(`${API_BASE}`, {
        method: 'POST',
        body: JSON.stringify({
          pool_name: formData.pool_name,
          network: formData.network,
          start: parseInt(formData.start),
          end: parseInt(formData.end),
        }),
      });
      if ((data as any).success) {
        showSuccess(`Pool "${formData.pool_name}" created with ${(data as any).data.total_ips} IPs`);
        setIsCreateOpen(false);
        setFormData({ pool_name: '', network: '', start: '2', end: '254' });
        loadData();
      } else {
        showError((data as any).message || 'Failed to create pool');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to create pool');
    }
  };

  const handleExpand = async () => {
    if (!expandData.pool_name || !expandData.network) {
      showError('Pool name and network are required');
      return;
    }
    try {
      const data = await apiAdmin(`${API_BASE}/expand`, {
        method: 'PUT',
        body: JSON.stringify({
          pool_name: expandData.pool_name,
          network: expandData.network,
          start: parseInt(expandData.start),
          end: parseInt(expandData.end),
        }),
      });
      if ((data as any).success) {
        showSuccess(`Pool expanded: ${(data as any).data.added} new IPs added (total: ${(data as any).data.total_ips})`);
        setIsExpandOpen(false);
        loadData();
      } else {
        showError((data as any).message || 'Failed to expand pool');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to expand pool');
    }
  };

  const handleDelete = async (poolName: string) => {
    const confirmed = await showConfirm(`Delete pool "${poolName}"?`, 'Only works if no IPs are allocated.');
    if (!confirmed) return;
    try {
      const data = await apiAdmin(`${API_BASE}?poolName=${encodeURIComponent(poolName)}`, { method: 'DELETE' });
      if ((data as any).success) {
        showSuccess(`Pool "${poolName}" deleted (${(data as any).data.deleted} IPs removed)`);
        loadData();
      } else {
        showError((data as any).message || 'Failed to delete pool');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to delete pool');
    }
  };

  const handleMap = async () => {
    if (!mapData.groupname || !mapData.pool_name) {
      showError('Group name and pool name are required');
      return;
    }
    try {
      const data = await apiAdmin(`${API_BASE}/mappings`, {
        method: 'POST',
        body: JSON.stringify(mapData),
      });
      if ((data as any).success) {
        showSuccess(`Mapped group "${mapData.groupname}" → pool "${mapData.pool_name}"`);
        setIsMapOpen(false);
        setMapData({ groupname: '', pool_name: '' });
        loadData();
      } else {
        showError((data as any).message || 'Failed to map pool');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to map pool');
    }
  };

  const handleUnmap = async (id: number, groupname: string) => {
    const confirmed = await showConfirm(`Remove mapping for group "${groupname}"?`);
    if (!confirmed) return;
    try {
      const data = await apiAdmin(`${API_BASE}/mappings/${id}`, { method: 'DELETE' });
      if ((data as any).success) {
        showSuccess('Mapping removed');
        loadData();
      } else {
        showError((data as any).message || 'Failed to remove mapping');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to remove mapping');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <Network className="w-6 h-6" />
            IP Pool Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">RADIUS ippool module — dynamic IP allocation per speed tier</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-cyan-400 transition-colors" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button onClick={() => setIsMapOpen(true)} className="px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 flex items-center gap-2 text-sm">
            <Link2 className="w-4 h-4" /> Map Group
          </button>
          <button onClick={() => setIsCreateOpen(true)} className="px-3 py-2 bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create Pool
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase">Total Pools</div>
            <div className="text-2xl font-bold text-cyan-400">{stats.total_pools}</div>
          </div>
          <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase">Total IPs</div>
            <div className="text-2xl font-bold text-blue-400">{stats.total_ips}</div>
          </div>
          <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase">Allocated</div>
            <div className="text-2xl font-bold text-green-400">{stats.allocated_ips}</div>
          </div>
          <div className="bg-gray-900/50 border border-cyan-900/50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase">Utilization</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.utilization}</div>
          </div>
        </div>
      )}

      {/* Pool List */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          <h2 className="font-semibold text-gray-200">IP Pools</h2>
        </div>
        {pools.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No IP pools created yet</p>
            <p className="text-xs mt-1">Create a pool to enable dynamic IP allocation</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/80 text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left">Pool Name</th>
                  <th className="px-4 py-2 text-right">Total IPs</th>
                  <th className="px-4 py-2 text-left">IP Range</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pools.map((pool) => (
                  <tr key={pool.pool_name} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-mono text-cyan-400">{pool.pool_name}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{pool.total_ips}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{pool.start_ip} → {pool.end_ip}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => loadDetails(pool.pool_name)} className="text-blue-400 hover:text-blue-300 px-2" title="Details">
                        <Activity className="w-4 h-4 inline" />
                      </button>
                      <button onClick={() => { setExpandData({ ...expandData, pool_name: pool.pool_name }); setIsExpandOpen(true); }} className="text-green-400 hover:text-green-300 px-2" title="Expand">
                        <Plus className="w-4 h-4 inline" />
                      </button>
                      <button onClick={() => handleDelete(pool.pool_name)} className="text-red-400 hover:text-red-300 px-2" title="Delete">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pool-Group Mappings */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-purple-400" />
          <h2 className="font-semibold text-gray-200">Pool-Name → Group Mappings (radgroupcheck)</h2>
        </div>
        {mappings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No mappings yet</p>
            <p className="text-xs mt-1">Map pools to RADIUS groups to enable per-speed-tier IP allocation</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/80 text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left">Group Name</th>
                  <th className="px-4 py-2 text-left">Pool Name</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-mono text-purple-400">{m.groupname}</td>
                    <td className="px-4 py-3 font-mono text-cyan-400">{m.pool_name}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleUnmap(m.id, m.groupname)} className="text-red-400 hover:text-red-300" title="Remove">
                        <Unlink className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pool Details Modal */}
      {details && selectedPool && (
        <SimpleModal isOpen={!!selectedPool} onClose={() => { setSelectedPool(null); setDetails(null); }} size="lg">
          <ModalHeader>
            <ModalTitle>Pool Details: {details.pool_name}</ModalTitle>
            <ModalDescription>Allocation summary and recent leases</ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded p-3">
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-xl font-bold text-blue-400">{details.total_ips}</div>
              </div>
              <div className="bg-gray-800/50 rounded p-3">
                <div className="text-xs text-gray-500">Allocated</div>
                <div className="text-xl font-bold text-green-400">{details.allocated}</div>
              </div>
              <div className="bg-gray-800/50 rounded p-3">
                <div className="text-xs text-gray-500">Free</div>
                <div className="text-xl font-bold text-yellow-400">{details.free}</div>
              </div>
            </div>
            {details.recent_allocations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Recent Allocations</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-400">
                      <tr>
                        <th className="px-2 py-1 text-left">IP</th>
                        <th className="px-2 py-1 text-left">User</th>
                        <th className="px-2 py-1 text-left">MAC</th>
                        <th className="px-2 py-1 text-left">NAS</th>
                        <th className="px-2 py-1 text-left">Expiry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {details.recent_allocations.map((a, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 font-mono text-cyan-400">{a.framedipaddress}</td>
                          <td className="px-2 py-1 text-gray-300">{a.username}</td>
                          <td className="px-2 py-1 font-mono text-gray-500">{a.callingstationid}</td>
                          <td className="px-2 py-1 font-mono text-gray-500">{a.nasipaddress}</td>
                          <td className="px-2 py-1 text-gray-500">{a.expiry_time ? new Date(a.expiry_time).toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </ModalBody>
        </SimpleModal>
      )}

      {/* Create Pool Modal */}
      <SimpleModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <ModalHeader>
          <ModalTitle>Create IP Pool</ModalTitle>
          <ModalDescription>Generate a range of IPs for dynamic allocation</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <div>
              <ModalLabel>Pool Name</ModalLabel>
              <ModalInput value={formData.pool_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, pool_name: e.target.value })} placeholder="e.g. 10Mbps-Pool" />
            </div>
            <div>
              <ModalLabel>Network (first 3 octets)</ModalLabel>
              <ModalInput value={formData.network} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, network: e.target.value })} placeholder="e.g. 172.19.200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ModalLabel>Start (last octet)</ModalLabel>
                <ModalInput type="number" value={formData.start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, start: e.target.value })} />
              </div>
              <div>
                <ModalLabel>End (last octet)</ModalLabel>
                <ModalInput type="number" value={formData.end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, end: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-gray-500">Will generate {parseInt(formData.end || '254') - parseInt(formData.start || '2') + 1} IPs</p>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButton variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={handleCreate}>Create Pool</ModalButton>
        </ModalFooter>
      </SimpleModal>

      {/* Expand Pool Modal */}
      <SimpleModal isOpen={isExpandOpen} onClose={() => setIsExpandOpen(false)}>
        <ModalHeader>
          <ModalTitle>Expand Pool: {expandData.pool_name}</ModalTitle>
          <ModalDescription>Add more IPs to existing pool</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <div>
              <ModalLabel>Network (first 3 octets)</ModalLabel>
              <ModalInput value={expandData.network} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpandData({ ...expandData, network: e.target.value })} placeholder="e.g. 172.19.201" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ModalLabel>Start</ModalLabel>
                <ModalInput type="number" value={expandData.start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpandData({ ...expandData, start: e.target.value })} />
              </div>
              <div>
                <ModalLabel>End</ModalLabel>
                <ModalInput type="number" value={expandData.end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpandData({ ...expandData, end: e.target.value })} />
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButton variant="secondary" onClick={() => setIsExpandOpen(false)}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={handleExpand}>Expand Pool</ModalButton>
        </ModalFooter>
      </SimpleModal>

      {/* Map Pool-Group Modal */}
      <SimpleModal isOpen={isMapOpen} onClose={() => setIsMapOpen(false)}>
        <ModalHeader>
          <ModalTitle>Map Pool to RADIUS Group</ModalTitle>
          <ModalDescription>Assign Pool-Name attribute to a group (radgroupcheck)</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <div>
              <ModalLabel>Group Name</ModalLabel>
              <ModalInput value={mapData.groupname} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMapData({ ...mapData, groupname: e.target.value })} placeholder="e.g. 10Mbps" />
            </div>
            <div>
              <ModalLabel>Pool Name</ModalLabel>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200"
                value={mapData.pool_name}
                onChange={(e) => setMapData({ ...mapData, pool_name: e.target.value })}
              >
                <option value="">Select pool...</option>
                {pools.map((p) => (
                  <option key={p.pool_name} value={p.pool_name}>{p.pool_name}</option>
                ))}
              </select>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButton variant="secondary" onClick={() => setIsMapOpen(false)}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={handleMap}>Map</ModalButton>
        </ModalFooter>
      </SimpleModal>
    </div>
  );
}
