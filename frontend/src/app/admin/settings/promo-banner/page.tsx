'use client';

import { useState, useRef } from 'react';
import { Plus, Edit2, Trash2, ImageOff, ExternalLink, GripVertical } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface PromoBanner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
}

interface BannersResponse {
  success: boolean;
  banners: PromoBanner[];
}

interface UploadResponse {
  success: boolean;
  url: string;
  error?: string;
}

const emptyForm = { imageUrl: '', linkUrl: '', title: '', order: 0, isActive: true };

export default function PromoBannerPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PromoBanner | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const bannersQueryKey = buildQueryKey('/api/settings/promo-banners');
  const { data, isLoading: loading } = useApiQuery<BannersResponse>('/api/settings/promo-banners', {
    staleTime: 60 * 1000,
  });
  const banners = data?.banners ?? [];

  const handleOpenModal = (banner?: PromoBanner) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        imageUrl: banner.imageUrl,
        linkUrl: banner.linkUrl || '',
        title: banner.title || '',
        order: banner.order,
        isActive: banner.isActive,
      });
    } else {
      setEditingBanner(null);
      setFormData({ ...emptyForm, order: banners.length });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingBanner(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiAdmin<UploadResponse>('/api/upload/banner', { method: 'POST', body: form });
      if (res.success) {
        setFormData((prev) => ({ ...prev, imageUrl: res.url }));
      } else {
        await showError(res.error || 'Gagal upload gambar.');
      }
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Terjadi kesalahan saat upload.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.imageUrl) {
      await showError('Silakan upload gambar banner terlebih dahulu.');
      return;
    }

    setSaving(true);
    try {
      const url = '/api/settings/promo-banners';
      const method = editingBanner ? 'PUT' : 'POST';
      const body = editingBanner ? { id: editingBanner.id, ...formData } : formData;

      await apiAdmin(url, { method, body: JSON.stringify(body) });

      queryClient.invalidateQueries({ queryKey: bannersQueryKey });
      handleCloseModal();
      await showSuccess(editingBanner ? 'Banner berhasil diperbarui' : 'Banner berhasil ditambahkan');
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal menyimpan banner');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (banner: PromoBanner) => {
    const confirmed = await showConfirm('Hapus banner ini? Tindakan ini tidak dapat dibatalkan.');
    if (!confirmed) return;

    try {
      await apiAdmin(`/api/settings/promo-banners?id=${banner.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: bannersQueryKey });
      await showSuccess('Banner berhasil dihapus');
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal menghapus banner');
    }
  };

  const handleToggleActive = async (banner: PromoBanner) => {
    try {
      await apiAdmin('/api/settings/promo-banners', {
        method: 'PUT',
        body: JSON.stringify({ id: banner.id, isActive: !banner.isActive }),
      });
      queryClient.invalidateQueries({ queryKey: bannersQueryKey });
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal mengubah status banner');
    }
  };

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-96 sm:h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500 dark:drop-">
              Promo Banner
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Kelola banner slideshow yang tampil di dashboard pelanggan
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={20} />
            Tambah Banner
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-brand-500"></div>
          </div>
        ) : banners.length === 0 ? (
          <div className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border rounded-lg p-10 text-center text-muted-foreground">
            <ImageOff className="mx-auto mb-3 opacity-50" size={40} />
            Belum ada banner. Klik &quot;Tambah Banner&quot; untuk mengunggah banner pertama.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {banners.map((banner) => (
              <div
                key={banner.id}
                className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border rounded-lg overflow-hidden hover:border-primary/30 dark:hover:border-brand-500/50 transition-all"
              >
                <div className="relative h-32 bg-black/30">
                  <BannerPreviewImage src={banner.imageUrl} alt={banner.title || 'Banner'} />
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    <GripVertical size={12} />
                    Urutan {banner.order}
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-foreground text-sm truncate">
                      {banner.title || <span className="text-muted-foreground italic">Tanpa judul</span>}
                    </h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleOpenModal(banner)} className="text-muted-foreground hover:text-brand-500 transition-colors" title="Edit">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(banner)} className="text-muted-foreground hover:text-pink-500 transition-colors" title="Hapus">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {banner.linkUrl && (
                    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand-500 hover:underline truncate mb-2">
                      <ExternalLink size={12} />
                      {banner.linkUrl}
                    </a>
                  )}
                  <button
                    onClick={() => handleToggleActive(banner)}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      banner.isActive
                        ? 'bg-brand-500/20 text-brand-500 border border-brand-500/30'
                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}
                  >
                    {banner.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        <SimpleModal isOpen={showModal} onClose={handleCloseModal} size="md">
          <ModalHeader>
            <ModalTitle>{editingBanner ? 'Edit Banner' : 'Tambah Banner'}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>Gambar Banner</ModalLabel>
                <div className="mt-2 space-y-2">
                  {formData.imageUrl && (
                    <div className="relative h-40 bg-black/30 rounded-lg overflow-hidden border border-border">
                      <BannerPreviewImage src={formData.imageUrl} alt="Preview" />
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-500/10 file:text-brand-500 hover:file:bg-brand-500/20"
                  />
                  {uploading && <p className="text-xs text-brand-500">Mengunggah gambar...</p>}
                  <p className="text-[11px] text-muted-foreground">Gambar apa pun ditampilkan utuh tanpa terpotong (rasio bebas), maksimal 5MB (PNG/JPG/WebP/GIF). Rasio lebar seperti 16:9 akan mengisi ruang paling penuh.</p>
                </div>
              </div>
              <div>
                <ModalLabel>Judul (opsional)</ModalLabel>
                <ModalInput type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Contoh: Promo Bulan Ini" />
              </div>
              <div>
                <ModalLabel>Link Tujuan (opsional)</ModalLabel>
                <ModalInput type="url" value={formData.linkUrl} onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })} placeholder="https://wa.me/62xxxx" />
              </div>
              <div>
                <ModalLabel>Urutan Tampil</ModalLabel>
                <ModalInput type="number" value={formData.order} onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-border bg-background dark:bg-card accent-brand-500 w-4 h-4" />
                  <span>Aktif (tampil di dashboard pelanggan)</span>
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={handleCloseModal}>Batal</ModalButton>
              <ModalButton type="submit" variant="primary" disabled={saving || uploading}>{saving ? 'Menyimpan...' : 'Simpan'}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}

// Blurred cover backdrop + a contained foreground image — matches exactly how
// PromoBannerSlider renders on the customer dashboard, so what's previewed
// here is what customers will actually see (no surprise cropping either way).
function BannerPreviewImage({ src, alt }: { src: string; alt: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-50" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="relative w-full h-full object-contain" />
    </>
  );
}
