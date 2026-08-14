'use client';
import { useState, useEffect } from 'react';
import { RefreshCw, BarChart3, TrendingUp, Download, Upload, Users, Calendar, Zap } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api';

interface UsageRecord {
  username: string;
  period_start: string;
  period_end: string | null;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  upload_gb: string;
  download_gb: string;
  total_gb: string;
}

interface MonthlySummary {
  period: string;
  total_users: number;
  total_upload_gb: string;
  total_download_gb: string;
  users: Array<{
    username: string;
    upload_gb: string;
    download_gb: string;
    total_gb: string;
    periods: number;
  }>;
}

interface TopConsumers {
  period_days: number;
  total_users: number;
  top_consumers: Array<{
    username: string;
    upload_gb: string;
    download_gb: string;
    total_gb: string;
  }>;
}

interface TopConsumersResponse {
  data: TopConsumers | null;
}

interface MonthlySummaryResponse {
  data: MonthlySummary | null;
}

interface UserUsageResponse {
  data: UsageRecord[];
}

interface AggregateResponse {
  success: boolean;
  data: { processed: number };
}

const API_BASE = '/api/admin/data-usage';

export default function DataUsagePage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'top' | 'monthly' | 'user'>('top');
  const [topConsumers, setTopConsumers] = useState<TopConsumers | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [userUsage, setUserUsage] = useState<UsageRecord[]>([]);
  const [topDays, setTopDays] = useState(30);
  const [topLimit, setTopLimit] = useState(20);
  const [searchUser, setSearchUser] = useState('');
  const [now] = useState(new Date());

  useEffect(() => {
    loadTop();
  }, []);

  const loadTop = async () => {
    setLoading(true);
    try {
      const data = await apiAdmin<TopConsumersResponse>(`${API_BASE}/top?days=${topDays}&limit=${topLimit}`);
      setTopConsumers(data.data || null);
    } catch (err: unknown) {
      console.error('Failed to load top consumers', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthly = async () => {
    setLoading(true);
    try {
      const data = await apiAdmin<MonthlySummaryResponse>(`${API_BASE}/monthly`);
      setMonthly(data.data || null);
    } catch (err: unknown) {
      console.error('Failed to load monthly summary', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserUsage = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchUser) params.set('username', searchUser);
      const data = await apiAdmin<UserUsageResponse>(`${API_BASE}?${params.toString()}`);
      setUserUsage(data.data || []);
    } catch (err: unknown) {
      console.error('Failed to load user usage', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerAggregate = async () => {
    try {
      const data = await apiAdmin<AggregateResponse>(`${API_BASE}/aggregate`, { method: 'POST' });
      if (data.success) {
        alert(`Aggregation complete: ${data.data.processed} users processed`);
        if (tab === 'top') loadTop();
        else if (tab === 'monthly') loadMonthly();
        else loadUserUsage();
      }
    } catch (err: unknown) {
      alert('Failed to trigger aggregation');
    }
  };

  const switchTab = (newTab: 'top' | 'monthly' | 'user') => {
    setTab(newTab);
    if (newTab === 'top') loadTop();
    else if (newTab === 'monthly') loadMonthly();
    else loadUserUsage();
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
            <BarChart3 className="w-6 h-6" />
            Data Usage Reports
          </h1>
          <p className="text-sm text-gray-400 mt-1">Bandwidth tracking per user — aggregated daily from radacct</p>
        </div>
        <div className="flex gap-2">
          <button onClick={triggerAggregate} className="px-3 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 flex items-center gap-2 text-sm" title="Manual aggregate">
            <Zap className="w-4 h-4" /> Aggregate
          </button>
          <button onClick={() => switchTab(tab)} className="p-2 text-gray-400 hover:text-cyan-400 transition-colors" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        <button
          onClick={() => switchTab('top')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'top' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
        >
          <TrendingUp className="w-4 h-4 inline mr-1" /> Top Consumers
        </button>
        <button
          onClick={() => switchTab('monthly')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'monthly' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
        >
          <Calendar className="w-4 h-4 inline mr-1" /> Monthly Summary
        </button>
        <button
          onClick={() => switchTab('user')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'user' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
        >
          <Users className="w-4 h-4 inline mr-1" /> Per User
        </button>
      </div>

      {/* Top Consumers Tab */}
      {tab === 'top' && topConsumers && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <select value={topDays} onChange={(e) => { setTopDays(Number(e.target.value)); }} className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select value={topLimit} onChange={(e) => { setTopLimit(Number(e.target.value)); }} className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200">
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
            <button onClick={loadTop} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-400 rounded text-sm hover:bg-cyan-600/30">Apply</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase">Total Users (period)</div>
              <div className="text-2xl font-bold text-cyan-400">{topConsumers.total_users}</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase">Period</div>
              <div className="text-2xl font-bold text-blue-400">{topConsumers.period_days} days</div>
            </div>
          </div>

          {topConsumers.top_consumers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-gray-900/50 border border-gray-800 rounded-lg">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No data usage records found</p>
              <p className="text-xs mt-1">Run aggregation or wait for daily cron (00:05)</p>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/80 text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Username</th>
                    <th className="px-4 py-2 text-right">Upload (GB)</th>
                    <th className="px-4 py-2 text-right">Download (GB)</th>
                    <th className="px-4 py-2 text-right">Total (GB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {topConsumers.top_consumers.map((u, i) => (
                    <tr key={u.username} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-cyan-400">{u.username}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{u.upload_gb}</td>
                      <td className="px-4 py-3 text-right text-green-400">{u.download_gb}</td>
                      <td className="px-4 py-3 text-right font-bold text-yellow-400">{u.total_gb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Monthly Summary Tab */}
      {tab === 'monthly' && monthly && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase">Period</div>
              <div className="text-2xl font-bold text-cyan-400">{monthly.period}</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase">Total Upload</div>
              <div className="text-2xl font-bold text-blue-400">{monthly.total_upload_gb} GB</div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase">Total Download</div>
              <div className="text-2xl font-bold text-green-400">{monthly.total_download_gb} GB</div>
            </div>
          </div>

          {monthly.users.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-gray-900/50 border border-gray-800 rounded-lg">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No data for this month</p>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/80 text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Username</th>
                    <th className="px-4 py-2 text-right">Upload (GB)</th>
                    <th className="px-4 py-2 text-right">Download (GB)</th>
                    <th className="px-4 py-2 text-right">Total (GB)</th>
                    <th className="px-4 py-2 text-right">Periods</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {monthly.users.map((u) => (
                    <tr key={u.username} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-cyan-400">{u.username}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{u.upload_gb}</td>
                      <td className="px-4 py-3 text-right text-green-400">{u.download_gb}</td>
                      <td className="px-4 py-3 text-right font-bold text-yellow-400">{u.total_gb}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{u.periods}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Per User Tab */}
      {tab === 'user' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadUserUsage()}
              placeholder="Enter username..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
            />
            <button onClick={loadUserUsage} className="px-4 py-1.5 bg-cyan-600/20 text-cyan-400 rounded text-sm hover:bg-cyan-600/30">Search</button>
          </div>

          {userUsage.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-gray-900/50 border border-gray-800 rounded-lg">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchUser ? `No data for user "${searchUser}"` : 'Enter a username to search'}</p>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/80 text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Username</th>
                    <th className="px-4 py-2 text-left">Period Start</th>
                    <th className="px-4 py-2 text-left">Period End</th>
                    <th className="px-4 py-2 text-right">Upload (GB)</th>
                    <th className="px-4 py-2 text-right">Download (GB)</th>
                    <th className="px-4 py-2 text-right">Total (GB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {userUsage.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-cyan-400">{r.username}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(r.period_start).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-400">{r.period_end ? new Date(r.period_end).toLocaleString() : '-'}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{r.upload_gb}</td>
                      <td className="px-4 py-3 text-right text-green-400">{r.download_gb}</td>
                      <td className="px-4 py-3 text-right font-bold text-yellow-400">{r.total_gb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
