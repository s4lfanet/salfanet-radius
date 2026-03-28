'use client';
import { showSuccess, showError } from '@/lib/sweetalert';
import { format } from 'date-fns';
import { useTranslation } from '@/hooks/useTranslation';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  MessageCircle,
  X as CloseIcon,
} from 'lucide-react';

interface AgentData {
  id: string;
  name: string;
  phone: string;
}

interface Profile {
  id: string;
  name: string;
}

interface Voucher {
  id: string;
  code: string;
  batchCode: string;
  status: string;
  profileName: string;
  sellingPrice: number;
  resellerFee: number;
  routerName: string | null;
  firstLoginAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function AgentVouchersPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  
  // Filter & Pagination
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // WhatsApp functionality
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  useEffect(() => {
    const agentDataStr = localStorage.getItem('agentData');
    if (!agentDataStr) {
      router.push('/agent');
      return;
    }

    const agentData = JSON.parse(agentDataStr);
    setAgent(agentData);
    loadVouchers();
  }, [router]);

  // API /api/agent/dashboard returns voucher datetimes as local datetime strings
  // (without timezone suffix), same pattern used by admin voucher page.
  const formatLocal = (date: Date | string | null, formatStr: string) => {
    if (!date) return '-';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return format(d, formatStr);
    } catch {
      return '-';
    }
  };

  const loadVouchers = async (page = 1, status = '', profileId = '', search = '', limit = 20) => {
    try {
      const token = localStorage.getItem('agentToken');
      if (!token) { router.push('/agent'); return; }
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (status) params.append('status', status);
      if (profileId) params.append('profileId', profileId);
      if (search) params.append('search', search);

      const res = await fetch(`/api/agent/dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setVouchers(data.vouchers || []);
        setProfiles(data.profiles || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch (error) {
      console.error('Load vouchers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    setCurrentPage(1);
    loadVouchers(1, filterStatus, filterProfile, searchCode, perPage);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    loadVouchers(newPage, filterStatus, filterProfile, searchCode, perPage);
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
    loadVouchers(1, filterStatus, filterProfile, searchCode, newPerPage);
  };

  const handleClearFilter = () => {
    setFilterStatus('');
    setFilterProfile('');
    setSearchCode('');
    setCurrentPage(1);
    loadVouchers(1, '', '', '', perPage);
  };

  const handleSelectVoucher = (voucherId: string) => {
    setSelectedVouchers(prev =>
      prev.includes(voucherId)
        ? prev.filter(id => id !== voucherId)
        : [...prev, voucherId]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const waitingVouchers = vouchers.filter(v => v.status === 'WAITING').map(v => v.id);
      setSelectedVouchers(waitingVouchers);
    } else {
      setSelectedVouchers([]);
    }
  };

  const handleSendWhatsApp = () => {
    if (selectedVouchers.length === 0) {
      showError('Pilih voucher terlebih dahulu');
      return;
    }
    setShowWhatsAppDialog(true);
  };

  const handleWhatsAppSubmit = async () => {
    if (!whatsappPhone) {
      await showError('Masukkan nomor WhatsApp');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const selectedVoucherData = vouchers.filter(v => selectedVouchers.includes(v.id));
      let message = `*Voucher Internet Anda*\n\n`;
      
      selectedVoucherData.forEach((v, idx) => {
        message += `${idx + 1}. Kode: *${v.code}*\n`;
        message += `   Paket: ${v.profileName}\n`;
        message += `   Status: ${v.status}\n\n`;
      });

      message += `Total: ${selectedVoucherData.length} voucher\n\n`;
      message += `Terima kasih!`;

      const encodedMessage = encodeURIComponent(message);
      const waUrl = `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;
      
      window.open(waUrl, '_blank');
      
      setShowWhatsAppDialog(false);
      setWhatsappPhone('');
      setSelectedVouchers([]);
      await showSuccess(t('agent.portal.whatsappOpened'));
    } catch (error) {
      await showError(t('agent.portal.whatsappSentError'));
    } finally {
      setSendingWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-slate-500 dark:text-[#e0d0ff]/70">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Vouchers List */}
      <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-2xl border-2 border-purple-300 dark:border-[#bc13fe]/30 overflow-hidden shadow-[0_0_30px_rgba(188,19,254,0.15)]">
        <div className="px-5 py-4 border-b border-purple-200 dark:border-[#bc13fe]/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('agent.portal.voucherList')}</h2>
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mt-0.5">{t('agent.portal.total')}: {pagination.total} {t('agent.portal.voucher').toLowerCase()}</p>
            </div>
            {selectedVouchers.length > 0 && (
              <button
                onClick={handleSendWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ff88] hover:bg-[#00dd77] text-black rounded-lg text-xs transition font-bold shadow-[0_0_15px_rgba(0,255,136,0.4)]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {t('agent.portal.sendWhatsApp')} ({selectedVouchers.length})
              </button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#e0d0ff]/50" />
              <input
                type="text"
                placeholder={t('agent.portal.searchVoucher') + '...'}
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-lg text-white focus:border-[#00f7ff] outline-none"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-lg text-white min-w-[100px] outline-none"
            >
              <option value="">{t('agent.portal.allStatus')}</option>
              <option value="WAITING">{t('agent.portal.waiting')}</option>
              <option value="ACTIVE">{t('agent.portal.active')}</option>
              <option value="EXPIRED">{t('agent.portal.expired')}</option>
            </select>
            <select
              value={filterProfile}
              onChange={(e) => setFilterProfile(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-lg text-white min-w-[120px] outline-none"
            >
              <option value="">{t('agent.portal.allPackages')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleFilter}
              className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white rounded-lg text-xs transition font-bold"
            >
              <Filter className="h-3 w-3" />
              {t('agent.portal.filter')}
            </button>
            {(filterStatus || filterProfile || searchCode) && (
              <button
                onClick={handleClearFilter}
                className="px-3 py-2 text-xs text-slate-500 dark:text-[#e0d0ff]/70 hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 rounded-lg transition"
              >
                {t('agent.portal.reset')}
              </button>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">Per halaman:</span>
              <select
                value={perPage}
                onChange={(e) => handlePerPageChange(parseInt(e.target.value))}
                className="px-2 py-2 text-xs bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-lg text-white outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden divide-y divide-purple-100 dark:divide-[#bc13fe]/10">
          {vouchers.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#e0d0ff]/60">
              {t('agent.portal.noVouchers')}
            </div>
          ) : (
            vouchers.map((voucher) => (
              <div key={voucher.id} className="p-3 space-y-2 hover:bg-purple-50/50 dark:hover:bg-[#bc13fe]/5 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {voucher.status === 'WAITING' && (
                      <input
                        type="checkbox"
                        checked={selectedVouchers.includes(voucher.id)}
                        onChange={() => handleSelectVoucher(voucher.id)}
                        className="rounded border-purple-400 dark:border-[#bc13fe]/50 bg-[#0a0520] flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white">{voucher.code}</p>
                      <p className="text-[10px] text-slate-500 dark:text-[#e0d0ff]/60">Batch: {voucher.batchCode || '-'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0 ${voucher.status === 'ACTIVE'
                      ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40'
                      : voucher.status === 'EXPIRED'
                        ? 'bg-[#ff4466]/20 text-[#ff6b8a] border border-[#ff4466]/40'
                        : voucher.status === 'SOLD'
                          ? 'bg-[#00f7ff]/20 text-[#00f7ff] border border-[#00f7ff]/40'
                          : 'bg-[#ff44cc]/20 text-[#ff44cc] border border-[#ff44cc]/40'
                    }`}>
                    {voucher.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">Paket:</span>
                    <span className="text-white font-medium truncate ml-1">{voucher.profileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">Router:</span>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/60 truncate ml-1">{voucher.routerName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">First Used:</span>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/60">{voucher.firstLoginAt ? formatLocal(voucher.firstLoginAt, 'dd MMM HH:mm') : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">Expired:</span>
                    <span className={voucher.expiresAt && new Date(voucher.expiresAt) < new Date() ? 'text-[#ff6b8a]' : 'text-slate-500 dark:text-[#e0d0ff]/60'}>
                      {voucher.expiresAt ? formatLocal(voucher.expiresAt, 'dd MMM HH:mm') : '-'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-[#0a0520]/50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedVouchers.length > 0 && selectedVouchers.length === vouchers.filter(v => v.status === 'WAITING').length}
                    onChange={handleSelectAll}
                    className="rounded border-purple-400 dark:border-[#bc13fe]/50 bg-[#0a0520]"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.voucherCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.batch')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.package')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.router')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.status')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.firstUsed')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.expired')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#bc13fe]/10">
              {vouchers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#e0d0ff]/60">
                    {t('agent.portal.noVouchers')}
                  </td>
                </tr>
              ) : (
                vouchers.map((voucher) => (
                  <tr key={voucher.id} className="hover:bg-purple-50/50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3">
                      {voucher.status === 'WAITING' && (
                        <input
                          type="checkbox"
                          checked={selectedVouchers.includes(voucher.id)}
                          onChange={() => handleSelectVoucher(voucher.id)}
                          className="rounded border-purple-400 dark:border-[#bc13fe]/50 bg-[#0a0520]"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-sm text-slate-900 dark:text-white">{voucher.code}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#e0d0ff]/60">{voucher.batchCode || '-'}</td>
                    <td className="px-4 py-3 text-xs text-white">{voucher.profileName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#e0d0ff]/60">{voucher.routerName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${voucher.status === 'ACTIVE'
                          ? 'bg-[#00ff88]/20 text-[#00ff88] border border-emerald-300 dark:border-[#00ff88]/40 shadow-[0_0_10px_rgba(0,255,136,0.2)]'
                          : voucher.status === 'EXPIRED'
                            ? 'bg-[#ff4466]/20 text-[#ff6b8a] border border-[#ff4466]/40'
                            : voucher.status === 'SOLD'
                              ? 'bg-[#00f7ff]/20 text-[#00f7ff] border border-cyan-300 dark:border-[#00f7ff]/40'
                              : 'bg-[#ff44cc]/20 text-[#ff44cc] border border-pink-300 dark:border-[#ff44cc]/40'
                        }`}>
                        {voucher.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#e0d0ff]/60">
                      {voucher.firstLoginAt ? formatLocal(voucher.firstLoginAt, 'dd MMM yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {voucher.expiresAt ? (
                        <span className={new Date(voucher.expiresAt) < new Date() ? 'text-[#ff6b8a]' : 'text-slate-500 dark:text-[#e0d0ff]/60'}>
                          {formatLocal(voucher.expiresAt, 'dd MMM yyyy HH:mm')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#e0d0ff]/60">
                      {voucher.createdAt ? formatLocal(voucher.createdAt, 'dd MMM yyyy HH:mm') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — always visible */}
        <div className="px-5 py-3 border-t border-purple-200 dark:border-[#bc13fe]/20 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">
            {pagination.total === 0
              ? 'Tidak ada voucher'
              : `Menampilkan ${((currentPage - 1) * pagination.limit) + 1}–${Math.min(currentPage * pagination.limit, pagination.total)} dari ${pagination.total} voucher`}
          </p>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 disabled:opacity-40 disabled:cursor-not-allowed text-slate-500 dark:text-[#e0d0ff]/70"
              >
                «
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4 text-[#e0d0ff]" />
              </button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1 text-xs rounded-lg transition ${currentPage === pageNum
                        ? 'bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white font-bold shadow-[0_0_10px_rgba(188,19,254,0.3)]'
                        : 'text-slate-500 dark:text-[#e0d0ff]/70 hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === pagination.totalPages}
                className="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4 text-[#e0d0ff]" />
              </button>
              <button
                onClick={() => handlePageChange(pagination.totalPages)}
                disabled={currentPage === pagination.totalPages}
                className="px-2 py-1 text-xs rounded hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 disabled:opacity-40 disabled:cursor-not-allowed text-slate-500 dark:text-[#e0d0ff]/70"
              >
                »
              </button>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Dialog */}
      {showWhatsAppDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a0f35] border-2 border-emerald-300 dark:border-[#00ff88]/50 rounded-2xl shadow-[0_0_50px_rgba(0,255,136,0.3)] max-w-sm w-full">
            <div className="px-5 py-4 border-b border-emerald-200 dark:border-[#00ff88]/20">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#00ff88]" />
                Kirim Voucher via WhatsApp
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mt-0.5">Kirim {selectedVouchers.length} voucher ke customer</p>
            </div>

            <div className="p-5">
              <label className="block text-xs font-medium text-slate-700 dark:text-[#e0d0ff] mb-1.5">Nomor WhatsApp</label>
              <input
                type="tel"
                placeholder="628123456789"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-white focus:border-[#00f7ff] outline-none"
              />
              <p className="text-xs text-slate-400 dark:text-[#e0d0ff]/50 mt-1">Masukkan nomor dengan kode negara</p>
            </div>

            <div className="px-5 py-4 border-t border-purple-200 dark:border-[#bc13fe]/20 flex gap-2 justify-end">
              <button
                onClick={() => { setShowWhatsAppDialog(false); setWhatsappPhone(''); }}
                className="px-4 py-2 text-sm text-slate-500 dark:text-[#e0d0ff]/70 hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={handleWhatsAppSubmit}
                disabled={sendingWhatsApp || !whatsappPhone}
                className="px-4 py-2 text-sm bg-[#00ff88] hover:bg-[#00dd77] text-black rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 font-bold"
              >
                {sendingWhatsApp ? (
                  <><div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>Mengirim...</>
                ) : (
                  <><MessageCircle className="h-3.5 w-3.5" />Kirim WhatsApp</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

