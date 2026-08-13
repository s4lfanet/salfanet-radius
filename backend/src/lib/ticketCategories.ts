/**
 * Standard ISP Ticket Categories Configuration
 * Kategori tiket standar untuk ISP Indonesia
 */

export const TICKET_CATEGORIES = [
  // Network & Connection Issues (Merah-Orange spectrum)
  {
    id: 'network-down',
    name: 'Gangguan Jaringan',
    nameKey: 'network-down',
    description: 'Internet mati total, tidak ada koneksi sama sekali',
    color: '#EF4444',
    priority: 'URGENT',
    slaHours: 4,
    group: 'network',
  },
  {
    id: 'slow-connection',
    name: 'Internet Lambat',
    nameKey: 'slow-connection',
    description: 'Kecepatan internet di bawah standar atau mengalami lag',
    color: '#F59E0B',
    priority: 'HIGH',
    slaHours: 8,
    group: 'network',
  },
  {
    id: 'unstable',
    name: 'Koneksi Putus-Putus',
    nameKey: 'unstable',
    description: 'Internet sering terputus dan nyambung lagi (unstable)',
    color: '#F97316',
    priority: 'HIGH',
    slaHours: 8,
    group: 'network',
  },
  {
    id: 'high-latency',
    name: 'Ping Tinggi/Loss',
    nameKey: 'high-latency',
    description: 'Latency tinggi atau packet loss saat gaming/browsing',
    color: '#EC4899',
    priority: 'MEDIUM',
    slaHours: 12,
    group: 'network',
  },
  
  // Installation & Technical (Hijau-Biru spectrum)
  {
    id: 'new-installation',
    name: 'Instalasi Baru',
    nameKey: 'new-installation',
    description: 'Permintaan pemasangan internet untuk pelanggan baru',
    color: '#10B981',
    priority: 'MEDIUM',
    slaHours: 48,
    group: 'technical',
  },
  {
    id: 'reinstallation',
    name: 'Pemasangan Ulang',
    nameKey: 'reinstallation',
    description: 'Re-instalasi karena pindah rumah atau masalah teknis',
    color: '#14B8A6',
    priority: 'MEDIUM',
    slaHours: 24,
    group: 'technical',
  },
  {
    id: 'relocation',
    name: 'Pindah Lokasi',
    nameKey: 'relocation',
    description: 'Request pemindahan instalasi ke alamat baru',
    color: '#06B6D4',
    priority: 'MEDIUM',
    slaHours: 72,
    group: 'technical',
  },
  {
    id: 'equipment-issue',
    name: 'Masalah Perangkat',
    nameKey: 'equipment-issue',
    description: 'Router/ONT/Modem bermasalah atau rusak',
    color: '#8B5CF6',
    priority: 'HIGH',
    slaHours: 12,
    group: 'technical',
  },
  
  // Billing & Account (Biru spectrum)
  {
    id: 'billing-issue',
    name: 'Masalah Tagihan',
    nameKey: 'billing-issue',
    description: 'Pertanyaan atau komplain terkait invoice/tagihan',
    color: '#3B82F6',
    priority: 'MEDIUM',
    slaHours: 24,
    group: 'billing',
  },
  {
    id: 'payment-confirmation',
    name: 'Konfirmasi Pembayaran',
    nameKey: 'payment-confirmation',
    description: 'Konfirmasi transfer yang belum tercatat sistem',
    color: '#6366F1',
    priority: 'MEDIUM',
    slaHours: 12,
    group: 'billing',
  },
  {
    id: 'upgrade-package',
    name: 'Upgrade Paket',
    nameKey: 'upgrade-package',
    description: 'Permintaan naik kecepatan/upgrade paket langganan',
    color: '#22C55E',
    priority: 'LOW',
    slaHours: 48,
    group: 'billing',
  },
  {
    id: 'downgrade-package',
    name: 'Downgrade Paket',
    nameKey: 'downgrade-package',
    description: 'Permintaan turun kecepatan/downgrade paket',
    color: '#84CC16',
    priority: 'LOW',
    slaHours: 48,
    group: 'billing',
  },
  {
    id: 'unsubscribe',
    name: 'Putus Langganan',
    nameKey: 'unsubscribe',
    description: 'Request berhenti berlangganan/unsubscribe',
    color: '#64748B',
    priority: 'MEDIUM',
    slaHours: 72,
    group: 'billing',
  },
  
  // Service & Support (Cyan-Purple spectrum)
  {
    id: 'information',
    name: 'Permintaan Informasi',
    nameKey: 'information',
    description: 'Tanya informasi paket, coverage area, promo',
    color: '#0EA5E9',
    priority: 'LOW',
    slaHours: 24,
    group: 'support',
  },
  {
    id: 'complaint',
    name: 'Keluhan Layanan',
    nameKey: 'complaint',
    description: 'Komplain tentang pelayanan atau customer service',
    color: '#DC2626',
    priority: 'HIGH',
    slaHours: 12,
    group: 'support',
  },
  {
    id: 'technician-visit',
    name: 'Request Teknisi',
    nameKey: 'technician-visit',
    description: 'Permintaan kunjungan teknisi untuk cek lapangan',
    color: '#7C3AED',
    priority: 'MEDIUM',
    slaHours: 24,
    group: 'support',
  },
  {
    id: 'password-reset',
    name: 'Lupa Password',
    nameKey: 'password-reset',
    description: 'Reset password WiFi atau akun pelanggan',
    color: '#F59E0B',
    priority: 'MEDIUM',
    slaHours: 4,
    group: 'support',
  },
  
  // Others (Grey spectrum)
  {
    id: 'feedback',
    name: 'Saran & Masukan',
    nameKey: 'feedback',
    description: 'Feedback atau saran untuk peningkatan layanan',
    color: '#059669',
    priority: 'LOW',
    slaHours: 72,
    group: 'support',
  },
  {
    id: 'other',
    name: 'Lain-lain',
    nameKey: 'other',
    description: 'Kategori umum untuk masalah yang tidak termasuk di atas',
    color: '#6B7280',
    priority: 'MEDIUM',
    slaHours: 24,
    group: 'support',
  },
];

export const getCategoryByName = (name: string) => {
  return TICKET_CATEGORIES.find(cat => cat.name === name);
};

export const getCategoryById = (id: string) => {
  return TICKET_CATEGORIES.find(cat => cat.id === id);
};

export const getCategoryColor = (name: string) => {
  return getCategoryByName(name)?.color || '#6B7280';
};

export const getDefaultSLA = (category: string) => {
  return getCategoryByName(category)?.slaHours || 24;
};

export const getCategoryNames = () => {
  return TICKET_CATEGORIES.map(cat => cat.name);
};

export const getCategoriesByGroup = (group: string) => {
  return TICKET_CATEGORIES.filter(cat => cat.group === group);
};

export const getGroupStats = () => {
  const network = TICKET_CATEGORIES.filter(cat => cat.group === 'network').length;
  const technical = TICKET_CATEGORIES.filter(cat => cat.group === 'technical').length;
  const billing = TICKET_CATEGORIES.filter(cat => cat.group === 'billing').length;
  const support = TICKET_CATEGORIES.filter(cat => cat.group === 'support').length;
  
  return {
    network,
    technical,
    billing: billing + support, // Combine billing and support
    total: TICKET_CATEGORIES.length,
  };
};
