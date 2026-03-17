'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Bell,
  Send,
  Users,
  Megaphone,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  XCircle,
  RadioTower,
  ReceiptText,
  Info,
  MessageSquare,
  Wrench,
  AlertTriangle,
  Gift,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { formatWIB } from '@/lib/timezone';

interface Area {
  id: string;
  name: string;
}

interface Stats {
  totalUsers: number;
  usersWithTokens: number;
  areas: Area[];
  totalBroadcasts: number;
  agentSubscribers?: number;
  technicianSubscribers?: number;
}

interface Broadcast {
  id: string;
  title: string;
  body: string;
  type: string;
  targetType: string;
  sentCount: number;
  failedCount: number;
  sentBy: string | null;
  createdAt: string;
}

type RecipientRole = 'customer' | 'agent' | 'technician' | 'all';

const NOTIFICATION_TYPES_BY_ROLE: Record<RecipientRole, Array<{ value: string; label: string; icon: React.ComponentType<any>; color: string; activeColor: string }>> = {
  customer: [
    { value: 'broadcast', label: 'Pengumuman', icon: RadioTower, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' },
    { value: 'tagihan', label: 'Tagihan', icon: ReceiptText, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', activeColor: 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/25' },
    { value: 'gangguan', label: 'Gangguan', icon: AlertTriangle, color: 'bg-red-500/10 text-red-600 border-red-500/30', activeColor: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/25' },
    { value: 'promo', label: 'Promo', icon: Gift, color: 'bg-pink-500/10 text-pink-600 border-pink-500/30', activeColor: 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/25' },
    { value: 'info', label: 'Info', icon: Info, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25' },
    { value: 'custom', label: 'Kustom', icon: MessageSquare, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25' },
  ],
  technician: [
    { value: 'broadcast', label: 'Pengumuman', icon: RadioTower, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' },
    { value: 'tugas_baru', label: 'Tugas Baru', icon: Wrench, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25' },
    { value: 'jadwal', label: 'Jadwal', icon: Zap, color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30', activeColor: 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/25' },
    { value: 'info_teknis', label: 'Info Teknis', icon: Info, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25' },
    { value: 'darurat', label: 'Darurat', icon: AlertTriangle, color: 'bg-red-500/10 text-red-600 border-red-500/30', activeColor: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/25' },
    { value: 'custom', label: 'Kustom', icon: MessageSquare, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25' },
  ],
  agent: [
    { value: 'broadcast', label: 'Pengumuman', icon: RadioTower, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' },
    { value: 'komisi', label: 'Komisi', icon: ReceiptText, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', activeColor: 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/25' },
    { value: 'registrasi_baru', label: 'Registrasi Baru', icon: Users, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25' },
    { value: 'target', label: 'Target', icon: Zap, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', activeColor: 'bg-yellow-500 text-white border-yellow-500 shadow-lg shadow-yellow-500/25' },
    { value: 'promo_agen', label: 'Promo Agen', icon: Gift, color: 'bg-pink-500/10 text-pink-600 border-pink-500/30', activeColor: 'bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/25' },
    { value: 'custom', label: 'Kustom', icon: MessageSquare, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25' },
  ],
  all: [
    { value: 'broadcast', label: 'Pengumuman', icon: RadioTower, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' },
    { value: 'gangguan', label: 'Gangguan Jaringan', icon: AlertTriangle, color: 'bg-red-500/10 text-red-600 border-red-500/30', activeColor: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/25' },
    { value: 'maintenance', label: 'Maintenance', icon: Wrench, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25' },
    { value: 'custom', label: 'Kustom', icon: MessageSquare, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25' },
  ],
};

const QUICK_TEMPLATES_BY_ROLE: Record<RecipientRole, Array<{ key: string; icon: React.ComponentType<any>; label: string; color: string }>> = {
  customer: [
    { key: 'cust_broadcast', icon: Megaphone, label: 'Pengumuman Umum', color: 'text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' },
    { key: 'cust_tagihan', icon: ReceiptText, label: 'Tagihan Jatuh Tempo', color: 'text-orange-500 bg-orange-50 border-orange-200 hover:bg-orange-100 hover:border-orange-300' },
    { key: 'cust_maintenance', icon: Wrench, label: 'Maintenance', color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300' },
    { key: 'cust_gangguan', icon: AlertTriangle, label: 'Gangguan Jaringan', color: 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' },
    { key: 'cust_promo', icon: Gift, label: 'Promo Spesial', color: 'text-pink-500 bg-pink-50 border-pink-200 hover:bg-pink-100 hover:border-pink-300' },
    { key: 'cust_info', icon: Info, label: 'Info Layanan', color: 'text-emerald-500 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' },
  ],
  technician: [
    { key: 'tech_broadcast', icon: Megaphone, label: 'Pengumuman Teknisi', color: 'text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' },
    { key: 'tech_tugas', icon: Wrench, label: 'Ada Tugas Baru', color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300' },
    { key: 'tech_jadwal', icon: Zap, label: 'Perubahan Jadwal', color: 'text-cyan-600 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300' },
    { key: 'tech_darurat', icon: AlertTriangle, label: 'Kondisi Darurat', color: 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' },
    { key: 'tech_maintenance', icon: Wrench, label: 'Jadwal Maintenance', color: 'text-amber-500 bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300' },
    { key: 'tech_info', icon: Info, label: 'Info Teknis', color: 'text-emerald-500 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' },
  ],
  agent: [
    { key: 'agent_broadcast', icon: Megaphone, label: 'Pengumuman Agen', color: 'text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' },
    { key: 'agent_komisi', icon: ReceiptText, label: 'Komisi Diterima', color: 'text-orange-500 bg-orange-50 border-orange-200 hover:bg-orange-100 hover:border-orange-300' },
    { key: 'agent_registrasi', icon: Users, label: 'Registrasi Baru', color: 'text-emerald-500 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' },
    { key: 'agent_target', icon: Zap, label: 'Update Target', color: 'text-yellow-600 bg-yellow-50 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300' },
    { key: 'agent_promo', icon: Gift, label: 'Promo Agen', color: 'text-pink-500 bg-pink-50 border-pink-200 hover:bg-pink-100 hover:border-pink-300' },
    { key: 'agent_info', icon: Info, label: 'Info Agen', color: 'text-cyan-500 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300' },
  ],
  all: [
    { key: 'all_broadcast', icon: Megaphone, label: 'Pengumuman Semua', color: 'text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' },
    { key: 'all_gangguan', icon: AlertTriangle, label: 'Gangguan Jaringan', color: 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' },
    { key: 'all_maintenance', icon: Wrench, label: 'Maintenance', color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300' },
  ],
};

const TEMPLATE_CONTENT: Record<string, { title: string; body: string }> = {
  // Customer templates
  cust_broadcast: { title: '📢 Pengumuman dari Salfanet', body: 'Kepada pelanggan setia Salfanet, kami ingin menyampaikan informasi penting. Terima kasih atas kepercayaan Anda.' },
  cust_tagihan: { title: '💳 Tagihan Internet Jatuh Tempo', body: 'Tagihan internet Anda akan segera jatuh tempo. Segera lakukan pembayaran agar layanan tetap aktif.' },
  cust_maintenance: { title: '🔧 Jadwal Maintenance Jaringan', body: 'Akan dilakukan maintenance jaringan. Layanan internet mungkin terganggu sementara. Mohon maaf atas ketidaknyamanannya.' },
  cust_gangguan: { title: '⚠️ Gangguan Jaringan', body: 'Saat ini terjadi gangguan pada jaringan kami. Tim teknis sedang bekerja untuk memulihkan layanan. Mohon maaf atas ketidaknyamanannya.' },
  cust_promo: { title: '🎁 Promo Spesial Salfanet!', body: 'Dapatkan penawaran spesial dari Salfanet! Upgrade paket internet Anda dengan harga terbaik. Berlaku terbatas!' },
  cust_info: { title: 'ℹ️ Informasi Layanan Salfanet', body: 'Kepada pelanggan Salfanet, berikut informasi penting terkait layanan kami. Harap dibaca dengan seksama.' },
  // Technician templates
  tech_broadcast: { title: '📢 Pengumuman untuk Teknisi', body: 'Kepada seluruh teknisi Salfanet, berikut pengumuman penting dari manajemen. Harap diperhatikan.' },
  tech_tugas: { title: '🔧 Ada Tugas Baru untuk Anda', body: 'Anda mendapat penugasan baru. Segera cek aplikasi teknisi untuk detail pekerjaan dan lokasi pelanggan.' },
  tech_jadwal: { title: '📅 Perubahan Jadwal Kerja', body: 'Terdapat perubahan pada jadwal kerja Anda. Silakan cek aplikasi teknisi untuk jadwal terbaru.' },
  tech_darurat: { title: '🚨 Kondisi Darurat - Tindakan Segera', body: 'Terjadi kondisi darurat pada jaringan. Semua teknisi harap segera standby dan hubungi supervisor Anda.' },
  tech_maintenance: { title: '🛠️ Jadwal Maintenance Terjadwal', body: 'Pengingat: ada jadwal maintenance terjadwal. Pastikan semua peralatan siap dan koordinasikan dengan tim.' },
  tech_info: { title: 'ℹ️ Info Teknis Terbaru', body: 'Ada informasi teknis penting yang perlu diketahui seluruh teknisi. Harap baca dan implementasikan.' },
  // Agent templates
  agent_broadcast: { title: '📢 Pengumuman untuk Agen', body: 'Kepada seluruh agen Salfanet, berikut pengumuman penting dari manajemen. Harap diperhatikan.' },
  agent_komisi: { title: '💰 Komisi Anda Telah Diproses', body: 'Komisi penjualan Anda telah diproses dan siap dicairkan. Cek aplikasi agen untuk detail komisi Anda.' },
  agent_registrasi: { title: '🎉 Ada Registrasi Pelanggan Baru!', body: 'Ada pelanggan baru yang mendaftar melalui kode referral Anda. Terus tingkatkan penjualan untuk bonus lebih besar!' },
  agent_target: { title: '🎯 Update Target Bulanan', body: 'Target penjualan bulan ini telah diperbarui. Cek aplikasi agen untuk melihat progress dan sisa target Anda.' },
  agent_promo: { title: '🎁 Promo Spesial untuk Agen', body: 'Ada promo spesial yang bisa Anda tawarkan kepada calon pelanggan. Cek detail promo dan manfaatkan kesempatan ini!' },
  agent_info: { title: 'ℹ️ Informasi Penting untuk Agen', body: 'Ada informasi penting yang perlu diketahui seluruh agen Salfanet. Harap baca dan pahami dengan seksama.' },
  // All templates
  all_broadcast: { title: '📢 Pengumuman Salfanet', body: 'Kepada seluruh pengguna, pelanggan, teknisi, dan agen Salfanet — berikut pengumuman penting dari manajemen.' },
  all_gangguan: { title: '⚠️ Gangguan Jaringan Area', body: 'Saat ini terjadi gangguan pada jaringan di beberapa area. Tim teknis sedang bekerja keras untuk pemulihan. Mohon maaf atas gangguan yang terjadi.' },
  all_maintenance: { title: '🔧 Scheduled Maintenance', body: 'Akan dilakukan pemeliharaan jaringan terjadwal. Teknisi harap standby, pelanggan mohon maaf atas gangguan sementara.' },
};

export default function PushNotificationsPage() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  const [stats, setStats] = useState<Stats | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form state
  const [recipientRole, setRecipientRole] = useState<RecipientRole>('customer');
  const [notifType, setNotifType] = useState('broadcast');
  const [targetType, setTargetType] = useState('all');
  const [selectedArea, setSelectedArea] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [extraLink, setExtraLink] = useState('');

  useEffect(() => {
    loadStats();
    loadHistory();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/push/send?action=stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Load stats error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/push/send?limit=30');
      const data = await res.json();
      if (data.success) {
        setBroadcasts(data.broadcasts);
      }
    } catch (error) {
      console.error('Load history error:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATE_CONTENT[key];
    if (tpl) {
      setTitle(tpl.title);
      setMessage(tpl.body);
    }
  };

  const handleRoleChange = (role: RecipientRole) => {
    setRecipientRole(role);
    setNotifType('broadcast');
    setTargetType('all');
    setSelectedArea('');
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      showError(t('pushNotif.titleAndMessageRequired'));
      return;
    }

    const roleLabel = recipientRole === 'customer' ? 'Pelanggan'
      : recipientRole === 'technician' ? 'Teknisi'
      : recipientRole === 'agent' ? 'Agen'
      : 'Semua (Pelanggan + Teknisi + Agen)';

    const targetLabel = recipientRole === 'agent' || recipientRole === 'technician'
      ? `Semua ${roleLabel}`
      : targetType === 'all' ? t('pushNotif.targetAll')
        : targetType === 'active' ? t('pushNotif.targetActive')
        : targetType === 'expired' ? t('pushNotif.targetExpired')
        : targetType === 'area' && selectedArea
          ? t('pushNotif.targetArea').replace('{name}', stats?.areas.find(a => a.id === selectedArea)?.name || selectedArea)
          : t('pushNotif.targetSelected');

    const confirmed = await showConfirm(
      t('pushNotif.confirmSendTitle'),
      `Kirim notifikasi "${title}" ke: ${roleLabel} — ${targetLabel}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const targetIds = targetType === 'area' && selectedArea ? [selectedArea] : [];

      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type: notifType,
          recipientRole,
          targetType,
          targetIds,
          sentBy: (session?.user as any)?.username || 'admin',
          data: extraLink ? { link: extraLink } : {},
        }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess(
          t('pushNotif.sentSuccess'),
          t('pushNotif.sentStats').replace('{sent}', data.stats.sent).replace('{failed}', data.stats.failed).replace('{total}', data.stats.total)
        );
        setTitle('');
        setMessage('');
        setExtraLink('');
        loadHistory();
        loadStats();
      } else {
        showError(data.error || t('pushNotif.sendFailed'));
      }
    } catch (error) {
      showError(t('pushNotif.sendError'));
    } finally {
      setSending(false);
    }
  };

  const getTypeBadge = (type: string) => {
    // Search across all role type defs
    for (const roleDefs of Object.values(NOTIFICATION_TYPES_BY_ROLE)) {
      const found = roleDefs.find((nt) => nt.value === type);
      if (found) {
        return (
          <Badge className={`${found.color} border text-xs font-semibold`}>
            {found.label}
          </Badge>
        );
      }
    }
    return <Badge variant="outline">{type}</Badge>;
  };

  const getTargetLabel = (tt: string) => {
    // New format: "role:targetType" e.g. "customer:all", "agent:all", "technician:all", "all:all"
    const [role, target] = tt.includes(':') ? tt.split(':') : ['customer', tt];
    const roleLabel = role === 'agent' ? 'Agen' : role === 'technician' ? 'Teknisi' : role === 'all' ? 'Semua' : 'Pelanggan';
    const targetLabel = target === 'all' ? t('pushNotif.allUsers')
      : target === 'active' ? t('pushNotif.activeUsers')
      : target === 'expired' ? t('pushNotif.expiredUsers')
      : target === 'area' ? t('pushNotif.perArea')
      : target === 'selected' ? t('pushNotif.selected')
      : target;
    return `${roleLabel} — ${targetLabel}`;
  };

  const coveragePct = stats && stats.totalUsers > 0 ? Math.round((stats.usersWithTokens / stats.totalUsers) * 100) : 0;
  const activeTypeDefs = NOTIFICATION_TYPES_BY_ROLE[recipientRole];
  const activeTemplates = QUICK_TEMPLATES_BY_ROLE[recipientRole];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {t('pushNotif.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('pushNotif.subtitle')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadStats(); loadHistory(); }} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('pushNotif.refresh')}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200/50 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">total</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold tracking-tight">{loading ? '—' : stats?.totalUsers ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('pushNotif.totalCustomers')}</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Smartphone className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">push</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold tracking-tight text-emerald-600">{loading ? '—' : stats?.usersWithTokens ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('pushNotif.registeredPush')}</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200/50 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <RadioTower className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">sent</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold tracking-tight">{loading ? '—' : stats?.totalBroadcasts ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('pushNotif.totalBroadcast')}</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200/50 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-lg sm:text-2xl font-bold tracking-tight text-purple-600">{loading ? '—' : `${coveragePct}%`}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('pushNotif.coverage')}</p>
            {!loading && stats && stats.totalUsers > 0 && (
              <div className="mt-2.5">
                <div className="w-full bg-purple-100 dark:bg-purple-900/30 rounded-full h-1.5">
                  <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="send" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="send" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Send className="w-4 h-4" />
            {t('pushNotif.sendNotification')}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Megaphone className="w-4 h-4" />
            {t('pushNotif.broadcastHistory')}
          </TabsTrigger>
        </TabsList>

        {/* Send Tab */}
        <TabsContent value="send" className="space-y-5 mt-4">
          {/* Recipient Role Selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                Kirim ke Siapa?
              </CardTitle>
              <CardDescription className="text-xs">Pilih penerima notifikasi ini</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 pb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { value: 'customer' as RecipientRole, label: 'Pelanggan', icon: Users, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', activeColor: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25', count: stats?.usersWithTokens ?? 0, unit: 'push' },
                  { value: 'technician' as RecipientRole, label: 'Teknisi', icon: Wrench, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', activeColor: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25', count: stats?.technicianSubscribers ?? 0, unit: 'terdaftar' },
                  { value: 'agent' as RecipientRole, label: 'Agen', icon: Megaphone, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', activeColor: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25', count: stats?.agentSubscribers ?? 0, unit: 'terdaftar' },
                  { value: 'all' as RecipientRole, label: 'Semua', icon: RadioTower, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', activeColor: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25', count: (stats?.usersWithTokens ?? 0) + (stats?.agentSubscribers ?? 0) + (stats?.technicianSubscribers ?? 0), unit: 'total' },
                ] as Array<{ value: RecipientRole; label: string; icon: React.ComponentType<any>; color: string; activeColor: string; count: number; unit: string }>).map((role) => {
                  const RoleIcon = role.icon;
                  const active = recipientRole === role.value;
                  return (
                    <button
                      key={role.value}
                      onClick={() => handleRoleChange(role.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200
                        ${active ? role.activeColor : `${role.color} hover:scale-[1.02]`}`}
                    >
                      <RoleIcon className="w-5 h-5" />
                      <span className="text-xs font-bold">{role.label}</span>
                      <span className={`text-[10px] font-medium ${active ? 'text-white/80' : 'text-muted-foreground'}`}>{role.count} {role.unit}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Tipe Notifikasi */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-500" />
                    {t('pushNotif.notificationType')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {activeTypeDefs.map((nt) => {
                      const Icon = nt.icon;
                      const active = notifType === nt.value;
                      return (
                        <button
                          key={nt.value}
                          onClick={() => {
                            setNotifType(nt.value);
                          }}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200
                            ${active ? nt.activeColor : `${nt.color} hover:scale-[1.02]`}`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-xs font-semibold text-center leading-tight">{nt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Template Cepat */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-500" />
                    {t('pushNotif.quickTemplate')}
                  </CardTitle>
                  <CardDescription className="text-xs">{t('pushNotif.clickToAutoFill')}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeTemplates.map((tpl) => {
                      const Icon = tpl.icon;
                      return (
                        <button
                          key={tpl.key}
                          onClick={() => applyTemplate(tpl.key)}
                          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg border transition-all duration-150 ${tpl.color}`}
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {tpl.label}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Isi Notifikasi */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-orange-500" />
                    {t('pushNotif.notificationContent')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0 pb-5">
                  <div>
                    <Label htmlFor="title" className="text-xs font-medium mb-1.5 block">
                      {t('pushNotif.titleLabel')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="title"
                      placeholder={t('pushNotif.titlePlaceholder')}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={100}
                      className="font-medium"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1 text-right">{title.length}/100</p>
                  </div>

                  <div>
                    <Label htmlFor="message" className="text-xs font-medium mb-1.5 block">
                      {t('pushNotif.messageLabel')} <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="message"
                      placeholder={t('pushNotif.messagePlaceholder')}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      maxLength={500}
                      className="resize-none leading-relaxed"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1 text-right">{message.length}/500</p>
                  </div>

                  <div>
                    <Label htmlFor="link" className="text-xs font-medium mb-1.5 block">
                      {t('pushNotif.deepLinkOptional')}
                    </Label>
                    <Input
                      id="link"
                      placeholder={t('pushNotif.deepLinkPlaceholder')}
                      value={extraLink}
                      onChange={(e) => setExtraLink(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{t('pushNotif.deepLinkHelp')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Target, Preview & Send */}
            <div className="space-y-4">
              {/* Target */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" />
                    {t('pushNotif.targetRecipient')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 pb-5">
                  {recipientRole === 'customer' && (
                    <>
                      <div>
                        <Label className="text-xs font-medium mb-1.5 block">{t('pushNotif.sendTo')}</Label>
                        <Select value={targetType} onValueChange={setTargetType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">🌐 {t('pushNotif.allCustomers')}</SelectItem>
                            <SelectItem value="active">✅ {t('pushNotif.activeCustomers')}</SelectItem>
                            <SelectItem value="expired">❌ {t('pushNotif.expiredCustomers')}</SelectItem>
                            <SelectItem value="area">📍 {t('pushNotif.perArea')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {targetType === 'area' && (
                        <div>
                          <Label className="text-xs font-medium mb-1.5 block">{t('pushNotif.selectArea')}</Label>
                          <Select value={selectedArea} onValueChange={setSelectedArea}>
                            <SelectTrigger>
                              <SelectValue placeholder={t('pushNotif.selectAreaPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {stats?.areas.map((area) => (
                                <SelectItem key={area.id} value={area.id}>
                                  {area.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Subscriber info */}
                  <div className="rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 p-4 space-y-2">
                    {recipientRole === 'customer' && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{t('pushNotif.registeredPushLabel')}</span>
                          <span className="font-bold text-emerald-600">{stats?.usersWithTokens ?? 0} {t('pushNotif.users')}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{t('pushNotif.totalCustomersLabel')}</span>
                          <span className="font-semibold">{stats?.totalUsers ?? 0} {t('pushNotif.users')}</span>
                        </div>
                        {stats && stats.totalUsers > 0 && (
                          <div className="pt-1.5">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-2 rounded-full transition-all"
                                style={{ width: `${coveragePct}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1.5 text-center font-medium">
                              {coveragePct}% coverage
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {recipientRole === 'technician' && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Teknisi dengan Push aktif</span>
                        <span className="font-bold text-amber-600">{stats?.technicianSubscribers ?? 0} teknisi</span>
                      </div>
                    )}
                    {recipientRole === 'agent' && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Agen dengan Push aktif</span>
                        <span className="font-bold text-emerald-600">{stats?.agentSubscribers ?? 0} agen</span>
                      </div>
                    )}
                    {recipientRole === 'all' && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Pelanggan</span>
                          <span className="font-bold text-blue-600">{stats?.usersWithTokens ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Teknisi</span>
                          <span className="font-bold text-amber-600">{stats?.technicianSubscribers ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Agen</span>
                          <span className="font-bold text-emerald-600">{stats?.agentSubscribers ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs border-t pt-2 mt-1">
                          <span className="text-muted-foreground font-semibold">Total penerima</span>
                          <span className="font-bold text-purple-600">{(stats?.usersWithTokens ?? 0) + (stats?.agentSubscribers ?? 0) + (stats?.technicianSubscribers ?? 0)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              {(title || message) && (
                <Card className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                      {t('pushNotif.previewNotification')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-5">
                    {/* Phone mockup */}
                    <div className="mx-auto max-w-[280px]">
                      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-1 shadow-xl">
                        {/* Phone notch */}
                        <div className="flex justify-center py-1">
                          <div className="w-20 h-1 bg-gray-700 rounded-full" />
                        </div>
                        {/* Notification card */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3.5 mx-1 mb-2">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                              <Bell className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SALFANET</span>
                                <span className="text-[9px] text-gray-500">{t('pushNotif.now')}</span>
                              </div>
                              <p className="text-[13px] font-bold text-white leading-snug line-clamp-2 mb-0.5">
                                {title || t('pushNotif.titlePreview')}
                              </p>
                              <p className="text-[11px] text-gray-300 leading-relaxed line-clamp-4 whitespace-pre-line">
                                {message || t('pushNotif.messagePreview')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Send Button */}
              <Button
                className="w-full gap-2 h-12 text-base font-bold shadow-lg"
                size="lg"
                onClick={handleSend}
                disabled={sending || !title.trim() || !message.trim() || (recipientRole === 'customer' && targetType === 'area' && !selectedArea)}
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    {t('pushNotif.sending')}
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {t('pushNotif.sendNotifButton')}
                  </>
                )}
              </Button>

              {stats?.usersWithTokens === 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800/30 p-4 text-xs text-orange-700 dark:text-orange-400">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('pushNotif.noTokenWarning')}
                  </p>
                  <p className="mt-1.5 leading-relaxed">{t('pushNotif.noTokenDesc')}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-orange-500" />
                    {t('pushNotif.broadcastHistory')}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">{t('pushNotif.allBroadcastsSent')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                  {t('pushNotif.refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground mt-3">Memuat data…</p>
                  </div>
                </div>
              ) : broadcasts.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <Megaphone className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t('pushNotif.noBroadcastYet')}</p>
                </div>
              ) : (
                <>
                {/* Mobile Card View */}
                <div className="block md:hidden space-y-3.5">
                  {broadcasts.map((bc) => (
                    <div key={bc.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight">{bc.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{bc.body}</p>
                        </div>
                        {getTypeBadge(bc.type)}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-xs mt-2">
                        <div>
                          <span className="text-muted-foreground text-[10px]">{t('pushNotif.headerTarget')}</span>
                          <p><Badge variant="outline" className="text-[10px]">{getTargetLabel(bc.targetType)}</Badge></p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px]">{t('pushNotif.headerSentBy')}</span>
                          <p className="text-xs font-medium">{bc.sentBy || 'admin'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600 font-bold text-sm">{bc.sentCount}</span>
                          <span className="text-muted-foreground text-[10px]">{t('pushNotif.headerSent')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {bc.failedCount > 0 ? (
                            <>
                              <XCircle className="w-3 h-3 text-red-500" />
                              <span className="text-red-500 font-bold text-sm">{bc.failedCount}</span>
                              <span className="text-muted-foreground text-[10px]">{t('pushNotif.headerFailed')}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-sm">\u2014</span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        {formatWIB(bc.createdAt, 'dd MMM yyyy HH:mm')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-semibold">{t('pushNotif.headerTitle')}</TableHead>
                        <TableHead className="font-semibold">{t('pushNotif.headerType')}</TableHead>
                        <TableHead className="font-semibold">{t('pushNotif.headerTarget')}</TableHead>
                        <TableHead className="text-center font-semibold">{t('pushNotif.headerSent')}</TableHead>
                        <TableHead className="text-center font-semibold">{t('pushNotif.headerFailed')}</TableHead>
                        <TableHead className="font-semibold">{t('pushNotif.headerSentBy')}</TableHead>
                        <TableHead className="font-semibold">{t('pushNotif.headerTime')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {broadcasts.map((bc) => (
                        <TableRow key={bc.id} className="group">
                          <TableCell className="max-w-[280px]">
                            <div>
                              <p className="font-semibold text-sm leading-tight">{bc.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{bc.body}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(bc.type)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-medium">
                              {getTargetLabel(bc.targetType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="font-bold text-sm">{bc.sentCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {bc.failedCount > 0 ? (
                              <div className="inline-flex items-center gap-1 text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3.5 h-3.5" />
                                <span className="font-bold text-sm">{bc.failedCount}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-medium text-muted-foreground">{bc.sentBy || 'admin'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatWIB(bc.createdAt, 'dd MMM yyyy HH:mm')}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
