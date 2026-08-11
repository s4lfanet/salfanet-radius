import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedTicketCategories() {
  console.log('🎫 Seeding ticket categories...');

  const categories = [
    // Network & Connection Issues (Merah-Orange spectrum)
    {
      id: 'network-down',
      name: 'Gangguan Jaringan',
      description: 'Internet mati total, tidak ada koneksi sama sekali',
      color: '#EF4444',
      isActive: true,
    },
    {
      id: 'slow-connection',
      name: 'Internet Lambat',
      description: 'Kecepatan internet di bawah standar atau mengalami lag',
      color: '#F59E0B',
      isActive: true,
    },
    {
      id: 'unstable',
      name: 'Koneksi Putus-Putus',
      description: 'Internet sering terputus dan nyambung lagi (unstable)',
      color: '#F97316',
      isActive: true,
    },
    {
      id: 'high-latency',
      name: 'Ping Tinggi/Loss',
      description: 'Latency tinggi atau packet loss saat gaming/browsing',
      color: '#EC4899',
      isActive: true,
    },
    
    // Installation & Technical (Hijau-Biru spectrum)
    {
      id: 'new-installation',
      name: 'Instalasi Baru',
      description: 'Permintaan pemasangan internet untuk pelanggan baru',
      color: '#10B981',
      isActive: true,
    },
    {
      id: 'reinstallation',
      name: 'Pemasangan Ulang',
      description: 'Re-instalasi karena pindah rumah atau masalah teknis',
      color: '#14B8A6',
      isActive: true,
    },
    {
      id: 'relocation',
      name: 'Pindah Lokasi',
      description: 'Request pemindahan instalasi ke alamat baru',
      color: '#06B6D4',
      isActive: true,
    },
    {
      id: 'equipment-issue',
      name: 'Masalah Perangkat',
      description: 'Router/ONT/Modem bermasalah atau rusak',
      color: '#8B5CF6',
      isActive: true,
    },
    
    // Billing & Account (Biru spectrum)
    {
      id: 'billing-issue',
      name: 'Masalah Tagihan',
      description: 'Pertanyaan atau komplain terkait invoice/tagihan',
      color: '#3B82F6',
      isActive: true,
    },
    {
      id: 'payment-confirmation',
      name: 'Konfirmasi Pembayaran',
      description: 'Konfirmasi transfer yang belum tercatat sistem',
      color: '#6366F1',
      isActive: true,
    },
    {
      id: 'upgrade-package',
      name: 'Upgrade Paket',
      description: 'Permintaan naik kecepatan/upgrade paket langganan',
      color: '#22C55E',
      isActive: true,
    },
    {
      id: 'downgrade-package',
      name: 'Downgrade Paket',
      description: 'Permintaan turun kecepatan/downgrade paket',
      color: '#84CC16',
      isActive: true,
    },
    {
      id: 'unsubscribe',
      name: 'Putus Langganan',
      description: 'Request berhenti berlangganan/unsubscribe',
      color: '#64748B',
      isActive: true,
    },
    
    // Service & Support (Cyan-Purple spectrum)
    {
      id: 'information',
      name: 'Permintaan Informasi',
      description: 'Tanya informasi paket, coverage area, promo',
      color: '#0EA5E9',
      isActive: true,
    },
    {
      id: 'complaint',
      name: 'Keluhan Layanan',
      description: 'Komplain tentang pelayanan atau customer service',
      color: '#DC2626',
      isActive: true,
    },
    {
      id: 'technician-visit',
      name: 'Request Teknisi',
      description: 'Permintaan kunjungan teknisi untuk cek lapangan',
      color: '#7C3AED',
      isActive: true,
    },
    {
      id: 'password-reset',
      name: 'Lupa Password',
      description: 'Reset password WiFi atau akun pelanggan',
      color: '#F59E0B',
      isActive: true,
    },
    
    // Others (Grey spectrum)
    {
      id: 'feedback',
      name: 'Saran & Masukan',
      description: 'Feedback atau saran untuk peningkatan layanan',
      color: '#059669',
      isActive: true,
    },
    {
      id: 'other',
      name: 'Lain-lain',
      description: 'Kategori umum untuk masalah yang tidak termasuk di atas',
      color: '#6B7280',
      isActive: true,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const category of categories) {
    try {
      await prisma.ticketCategory.upsert({
        where: { id: category.id },
        update: category,
        create: category,
      });
      created++;
    } catch (error) {
      console.error(`Failed to seed category ${category.id}:`, error);
      skipped++;
    }
  }

  console.log(`✅ Ticket categories seeded: ${created} created/updated, ${skipped} skipped`);
}

// Run if called directly
if (require.main === module) {
  seedTicketCategories()
    .then(() => {
      console.log('✅ Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
