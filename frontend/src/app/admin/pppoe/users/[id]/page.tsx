'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { formatWIB } from '@/lib/timezone';
import {
  ArrowLeft, User, Wifi, WifiOff, Shield, ShieldOff, Ban, CheckCircle2,
  Phone, Mail, MapPin, Calendar, CreditCard, Copy, ExternalLink, RefreshCw,
  AlertTriangle, FileText, Clock, Zap, Check, Activity, Eye, EyeOff,
  Hash, MessageCircle, Download, Upload, Timer, Server,
  ChevronDown, ChevronUp, Plus, SendHorizonal, Laptop,
} from 'lucide-react';

interface PppoeUserDetail {
  id: string;
  username: string;
  name: string;
  password: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  ipAddress: string | null;
  macAddress: string | null;
  comment: string | null;
  expiredAt: string | null;
  customerId: string | null;
  syncedToRadius: boolean;
  subscriptionType: string;
  createdAt: string;
  updatedAt: string;
  profile: { id: string; name: string; groupName: string; price?: number };
  router?: { id: string; name: string; nasname: string } | null;
  area?: { id: string; name: string } | null;
}

interface ActiveSession {
  radacctid: number;
  acctstarttime: string;
  framedipaddress: string;
  nasipaddress: string;
  callingstationid: string;
  acctinputoctets: number;
  acctoutputoctets: number;
  acctsessiontime: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  createdAt: string;
  paymentLink: string | null;
  paymentToken: string | null;
}

interface SessionRecord {
  id: string;
  startTime: string;
  stopTime: string | null;
  durationFormatted: string;
  download: string;
  upload: string;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

export default function PppoeUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser]                     = useState<PppoeUserDetail | null>(null);
  const [activeSession, setActiveSession]   = useState<ActiveSession | null>(null);
  const [invoices, setInvoices]             = useState<Invoice[]>([]);
  const [sessions, setSessions]             = useState<SessionRecord[]>([]);
  const [loading, setLoading]               = useState(true);
  const [copiedId, setCopiedId]             = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showPassword, setShowPassword]     = useState(false);
  const [showSessions, setShowSessions]     = useState(false);
  const [sendingWA, setSendingWA]           = useState(false);
  const [waResult, setWaResult]             = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [userRes, invoicesRes, sessionsRes] = await Promise.all([
        fetch(`/api/pppoe/users/${id}`),
        fetch(`/api/invoices?userId=${id}&limit=20`),
        fetch(`/api/pppoe/users/${id}/activity?type=sessions&limit=10`),
      ]);
      const userData     = await userRes.json();
      const invoicesData = await invoicesRes.json();
      const sessionsData = await sessionsRes.json();
      if (userData.user)          setUser(userData.user);
      if (userData.activeSession) setActiveSession(userData.activeSession);
      if (invoicesData.invoices)  setInvoices(invoicesData.invoices);
      if (sessionsData.sessions)  setSessions(sessionsData.sessions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!user) return;
    setChangingStatus(true);
    try {
      const res = await fetch('/api/pppoe/users/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, status: newStatus }),
      });
      if (res.ok) setUser({ ...user, status: newStatus });
    } finally {
      setChangingStatus(false);
    }
  };

  const sendWANotification = async () => {
    if (!user) return;
    setSendingWA(true);
    setWaResult(null);
    try {
      const res = await fetch('/api/pppoe/users/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [user.id], notificationType: 'invoice', notificationMethod: 'whatsapp' }),
      });
      const data = await res.json();
      setWaResult(res.ok ? 'Notifikasi WA berhasil dikirim!' : (data.error || 'Gagal mengirim WA'));
    } catch {
      setWaResult('Gagal terhubung ke server');
    } finally {
      setSendingWA(false);
      setTimeout(() => setWaResult(null), 4000);
    }
  };

  const copyLink = (link: string, key: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (d: string) => formatWIB(d, 'd MMM yyyy');

  const formatDateTime = (d: string) => formatWIB(d, 'd MMM yyyy HH:mm');

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':   return 'bg-success/15 text-success border-success/30';
      case 'isolated': return 'bg-pink-500/15 text-pink-500 border-pink-500/30';
      case 'blocked':  return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'stop':     return 'bg-gray-500/15 text-gray-500 border-gray-500/30';
      default:         return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getInvStyle = (status: string) => {
    switch (status) {
      case 'PAID':    return 'bg-success/15 text-success';
      case 'OVERDUE': return 'bg-destructive/15 text-destructive';
      case 'PENDING': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      default:        return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-destructive" />
        <p className="text-muted-foreground">User tidak ditemukan.</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-primary/10 border border-primary/30 rounded text-sm text-primary hover:bg-primary/20">
          Kembali
        </button>
      </div>
    );
  }

  const unpaidInvoices = invoices.filter(i => ['PENDING', 'OVERDUE'].includes(i.status));
  const isExpired = user.expiredAt ? new Date(user.expiredAt) < new Date() : false;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Detail Pelanggan PPPoE</h1>
          <p className="text-xs text-muted-foreground font-mono">ID: {user.customerId || user.id}</p>
        </div>
        <button onClick={fetchData} className="ml-auto p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── User Info Card ───────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Card Header */}
        <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-foreground">{user.name}</div>
              <div className="text-xs font-mono text-muted-foreground">{user.username}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getStatusStyle(user.status)}`}>
              {user.status === 'active'   && <Shield className="w-3 h-3" />}
              {user.status === 'isolated' && <ShieldOff className="w-3 h-3" />}
              {user.status === 'blocked'  && <Ban className="w-3 h-3" />}
              {user.status}
            </span>
            {user.syncedToRadius && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent/15 text-accent border border-accent/30">
                <CheckCircle2 className="w-2.5 h-2.5" /> Tersinkron
              </span>
            )}
            {activeSession && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <Wifi className="w-2.5 h-2.5" /> Online
              </span>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {user.phone && (
            <div className="flex items-start gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Telepon</div>
                <div className="text-foreground">{user.phone}</div>
              </div>
            </div>
          )}
          {user.email && (
            <div className="flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Email</div>
                <div className="text-foreground truncate max-w-[160px]">{user.email}</div>
              </div>
            </div>
          )}
          {user.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Alamat</div>
                <div className="text-foreground line-clamp-2">{user.address}</div>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] text-muted-foreground">Profil</div>
              <div className="text-foreground font-medium">{user.profile?.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{user.profile?.groupName}</div>
              {user.profile?.price !== undefined && user.profile.price > 0 && (
                <div className="text-[11px] text-primary font-semibold">{formatCurrency(user.profile.price)}</div>
              )}
            </div>
          </div>
          {user.router && (
            <div className="flex items-start gap-2">
              <Server className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Router</div>
                <div className="text-foreground">{user.router.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{user.router.nasname}</div>
              </div>
            </div>
          )}
          {user.expiredAt && (
            <div className="flex items-start gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Jatuh Tempo</div>
                <div className={isExpired ? 'text-destructive font-semibold' : 'text-foreground'}>
                  {formatDate(user.expiredAt)}
                  {isExpired && <span className="ml-1 text-[10px] bg-destructive/15 text-destructive px-1 rounded">Expired</span>}
                </div>
              </div>
            </div>
          )}
          {user.area && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Area</div>
                <div className="text-foreground">{user.area.name}</div>
              </div>
            </div>
          )}
          {user.customerId && (
            <div className="flex items-start gap-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Customer ID</div>
                <div className="text-foreground font-mono">{user.customerId}</div>
              </div>
            </div>
          )}
          {user.ipAddress && (
            <div className="flex items-start gap-2">
              <Laptop className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">IP Statis</div>
                <div className="text-foreground font-mono">{user.ipAddress}</div>
              </div>
            </div>
          )}
          {user.macAddress && (
            <div className="flex items-start gap-2">
              <Laptop className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">MAC Address</div>
                <div className="text-foreground font-mono text-xs">{user.macAddress}</div>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] text-muted-foreground">Terdaftar</div>
              <div className="text-foreground">{formatDate(user.createdAt)}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] text-muted-foreground">Tipe</div>
              <div className="text-foreground">{user.subscriptionType}</div>
            </div>
          </div>
          {/* Password */}
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] text-muted-foreground">Password PPPoE</div>
              <div className="flex items-center gap-2">
                <span className="text-foreground font-mono text-sm">{showPassword ? user.password : '••••••••'}</span>
                <button onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => copyLink(user.password, 'pwd')} className="text-muted-foreground hover:text-foreground transition-colors">
                  {copiedId === 'pwd' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
          {user.comment && (
            <div className="flex items-start gap-2 col-span-2 md:col-span-3">
              <MessageCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Catatan</div>
                <div className="text-foreground text-sm">{user.comment}</div>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Ubah status:</span>
          {(['active', 'isolated', 'blocked', 'stop'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={changingStatus || user.status === s}
              className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed
                ${user.status === s ? getStatusStyle(s) + ' cursor-default' : 'bg-muted border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
            >
              {s}
            </button>
          ))}
          <a
            href={`/admin/pppoe/users?edit=${user.id}`}
            className="ml-auto px-3 py-1 text-[11px] font-medium rounded border border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 transition-all"
          >
            Edit Lengkap →
          </a>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2 flex-wrap bg-muted/10">
          <span className="text-xs text-muted-foreground">Aksi cepat:</span>
          {user.phone && (
            <button
              onClick={sendWANotification}
              disabled={sendingWA}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-green-500/10 border border-green-500/30 rounded text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
            >
              {sendingWA ? <RefreshCw className="w-3 h-3 animate-spin" /> : <SendHorizonal className="w-3 h-3" />}
              Kirim Notif WA
            </button>
          )}
          {user.phone && (
            <a
              href={`https://wa.me/${user.phone.replace(/^0/, '62').replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-green-50/10 border border-green-500/20 rounded text-green-500/80 hover:bg-green-500/10 hover:text-green-500 transition-all"
            >
              <Phone className="w-3 h-3" />
              Buka WA
            </a>
          )}
          <a
            href={`/admin/invoices/create?userId=${user.id}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-primary/10 border border-primary/30 rounded text-primary hover:bg-primary/20 transition-all"
          >
            <Plus className="w-3 h-3" />
            Buat Invoice
          </a>
          <a
            href={`/isolated?username=${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-muted border border-border rounded text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
          >
            <ExternalLink className="w-3 h-3" />
            Portal Bayar
          </a>
          {waResult && (
            <span className={`text-[11px] px-2 py-1 rounded ${waResult.includes('berhasil') ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'}`}>
              {waResult}
            </span>
          )}
        </div>
      </div>

      {/* ── Active Session ───────────────────────────────────────────────── */}
      {activeSession ? (
        <div className="bg-card border border-emerald-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-sm text-foreground">Sesi Aktif</span>
            <span className="ml-auto text-xs text-muted-foreground">Sejak {formatDateTime(activeSession.acctstarttime)}</span>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Laptop className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">IP Aktif</div>
                <div className="text-foreground font-mono">{activeSession.framedipaddress}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Server className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">NAS</div>
                <div className="text-foreground font-mono">{activeSession.nasipaddress}</div>
              </div>
            </div>
            {activeSession.callingstationid && (
              <div className="flex items-start gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground">MAC Client</div>
                  <div className="text-foreground font-mono text-xs">{activeSession.callingstationid}</div>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Timer className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Durasi</div>
                <div className="text-foreground">{formatDuration(activeSession.acctsessiontime || 0)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Download className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Download (RX)</div>
                <div className="text-foreground">{formatBytes(Number(activeSession.acctinputoctets || 0))}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Upload className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Upload (TX)</div>
                <div className="text-foreground">{formatBytes(Number(activeSession.acctoutputoctets || 0))}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm text-muted-foreground">Tidak ada sesi aktif saat ini</span>
        </div>
      )}

      {/* ── Invoice List ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Riwayat Invoice</span>
            {unpaidInvoices.length > 0 && (
              <span className="px-2 py-0.5 bg-destructive/15 text-destructive text-[10px] font-bold rounded-full">
                {unpaidInvoices.length} belum bayar
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{invoices.length} total</span>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Belum ada invoice
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => {
              // Always use token-based relative path for navigation (works on any host)
              const payPath = inv.paymentToken ? `/pay/${inv.paymentToken}` : null;
              // For copying: use absolute URL with current window origin so shared links work
              const payLinkAbsolute = inv.paymentToken
                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${inv.paymentToken}`
                : inv.paymentLink;
              const isUnpaid = ['PENDING', 'OVERDUE'].includes(inv.status);
              return (
                <div key={inv.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${getInvStyle(inv.status)}`}>{inv.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">Jatuh tempo: {formatDate(inv.dueDate)}</span>
                      <span className="text-xs text-muted-foreground">Dibuat: {formatDate(inv.createdAt)}</span>
                    </div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${isUnpaid ? 'text-destructive' : 'text-success'}`}>
                    {formatCurrency(Number(inv.amount))}
                  </div>
                  {isUnpaid && payPath && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => copyLink(payLinkAbsolute || payPath, inv.id)} title="Salin link" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        {copiedId === inv.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <a href={payPath} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                  {isUnpaid && !payPath && (
                    <span className="text-[10px] text-muted-foreground px-2 py-1 bg-muted rounded shrink-0">No link</span>
                  )}
                  {inv.status === 'PAID' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
        {unpaidInvoices.length > 0 && (
          <div className="px-4 py-3 bg-destructive/5 border-t border-destructive/20 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span>Total belum bayar: <strong>{formatCurrency(unpaidInvoices.reduce((s, i) => s + Number(i.amount), 0))}</strong></span>
            </div>
            {(unpaidInvoices[0]?.paymentToken || unpaidInvoices[0]?.paymentLink) && (
              <a
                href={unpaidInvoices[0].paymentToken ? `/pay/${unpaidInvoices[0].paymentToken}` : unpaidInvoices[0].paymentLink!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded hover:bg-primary/90 transition-colors">
                <CreditCard className="w-3.5 h-3.5" />
                Bayar Sekarang
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Session History ──────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="w-full px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between hover:bg-muted/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm text-foreground">Riwayat Sesi</span>
              <span className="text-xs text-muted-foreground">({sessions.length} terakhir)</span>
            </div>
            {showSessions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showSessions && (
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <div key={s.id} className="px-4 py-2.5 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs hover:bg-muted/20">
                  <div>
                    <span className="text-muted-foreground">Mulai: </span>
                    <span className="text-foreground">{s.startTime ? formatDateTime(s.startTime) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Selesai: </span>
                    <span className={s.stopTime ? 'text-foreground' : 'text-emerald-500'}>{s.stopTime ? formatDateTime(s.stopTime) : 'Aktif'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Durasi: </span>
                    <span className="text-foreground">{s.durationFormatted}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-blue-400">↓ {s.download}</span>
                    <span className="text-amber-400">↑ {s.upload}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
