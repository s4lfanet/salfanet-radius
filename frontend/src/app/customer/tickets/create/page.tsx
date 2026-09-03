'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { ArrowLeft, Send, CheckCircle, MapPin, Navigation, Upload, X, FileText, Image as ImageIcon, MapPinned } from 'lucide-react';
import { CyberCard } from '@/components/cyberpunk/CyberCard';
import { CyberButton } from '@/components/cyberpunk/CyberButton';
import { apiCustomer, ApiError } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  color: string;
}

export default function CreateTicketPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addToast } = useToast();
  const toastError = (msg: string) => addToast({ type: 'error', title: 'Gagal', description: msg, duration: 8000 });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    categoryId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    locationTag: '',
    latitude: '',
    longitude: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number | null; lng: number | null; address: string | null }>({ lat: null, lng: null, address: null });

  useEffect(() => {
    fetchCategories();
    loadCustomerData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadCustomerData = async () => {
    const token = localStorage.getItem('customer_token');
    const userData = localStorage.getItem('customer_user');
    
    if (!token || !userData) {
      router.push('/customer/login');
      return;
    }
    
    try {
      const user = JSON.parse(userData);
      setFormData(prev => ({
        ...prev,
        customerName: user.name || user.username,
        customerPhone: user.phone || '',
        customerEmail: user.email || '',
      }));
    } catch (error) {
      router.push('/customer/login');
      return;
    }

    // Fetch full profile including coordinates from API
    try {
      const data = await apiCustomer<{ success: boolean; user: { address?: string; latitude?: number | null; longitude?: number | null } }>('/api/customer/me');
      if (data.success && data.user) {
        const { address, latitude, longitude } = data.user;
        setCustomerCoords({ lat: latitude ?? null, lng: longitude ?? null, address: address ?? null });
        // Auto-fill locationTag from address if available and empty
        if (address && !formData.locationTag) {
          setFormData(prev => ({ ...prev, locationTag: address }));
        }
        // Auto-fill coordinates from profile if available
        if (latitude != null && longitude != null) {
          setFormData(prev => ({
            ...prev,
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6),
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch customer profile for coords:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await apiCustomer<Category[]>('/api/tickets/categories?isActive=true');
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.subject.trim()) {
      newErrors.subject = t('ticket.subjectRequired');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('ticket.descriptionRequired');
    } else if (formData.description.trim().length < 10) {
      newErrors.description = t('ticket.descriptionTooShort');
    }

    if (!formData.customerName.trim()) {
      newErrors.customerName = t('ticket.nameRequired');
    }

    if (!formData.customerPhone.trim()) {
      newErrors.customerPhone = t('ticket.phoneRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [gpsLoading, setGpsLoading] = useState(false);

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      toastError('Browser tidak mendukung GPS');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
      },
      () => {
        toastError('Gagal mendapatkan lokasi GPS. Pastikan izin lokasi diaktifkan.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleUseCustomerCoords = () => {
    if (customerCoords.lat != null && customerCoords.lng != null) {
      setFormData(prev => ({
        ...prev,
        latitude: customerCoords.lat!.toFixed(6),
        longitude: customerCoords.lng!.toFixed(6),
      }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formDataObj = new FormData();
        formDataObj.append('file', file);

        const token = localStorage.getItem('customer_token');
        const res = await fetch('/api/customer/tickets/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataObj,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          toastError(data.error || `Gagal upload ${file.name}`);
          continue;
        }

        setUploadedFiles(prev => [...prev, { url: data.url, name: file.name, type: data.fileType }]);
      }
    } catch (err) {
      toastError('Gagal mengupload file');
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      // Get customer ID from session
      const userData = localStorage.getItem('customer_user');
      let customerId = null;
      if (userData) {
        try {
          const user = JSON.parse(userData);
          customerId = user.id;
        } catch (error) {
          console.error('Failed to parse user data:', error);
        }
      }

      const data = await apiCustomer<{ id: string; ticketNumber: string; error?: string }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          customerId, // Link ticket to customer
          attachments: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.url) : undefined,
        }),
      });

      setTicketNumber(data.ticketNumber);
      setSuccess(true);
      setTimeout(() => {
        router.push(`/customer/tickets/${data.id}`);
      }, 3000);
    } catch (error) {
      console.error('Failed to create ticket:', error);
      if (error instanceof ApiError) toastError(error.message || t('ticket.createFailed'));
      else toastError(t('ticket.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center p-4 py-12">
        <CyberCard className="p-8 max-w-md w-full text-center bg-card/90 backdrop-blur-xl border-2 border-success/30 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
          <CheckCircle size={64} className="text-success mx-auto mb-4 drop-shadow-[0_0_20px_rgba(34,197,94,0.8)]" />
          <h2 className="text-2xl font-bold text-success mb-2 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            {t('ticket.ticketCreated')}
          </h2>
          <p className="text-muted-foreground mb-4">
            {t('ticket.ticketNumberIs')}:
          </p>
          <div className="bg-success/10 border-2 border-success/30 rounded-lg p-4 mb-6 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
            <span className="text-2xl font-mono font-bold text-success drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">
              #{ticketNumber}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {t('ticket.whatsappNotificationSent')}
          </p>
          <p className="text-sm text-cyan-400">
            {t('ticket.redirectingToTicket')}...
          </p>
        </CyberCard>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-5 space-y-3 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/customer/tickets"
          className="text-cyan-400 hover:text-cyan-300 transition-colors drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            {t('ticket.createTicket')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('ticket.createTicketDescription')}
          </p>
        </div>
      </div>

      <CyberCard className="p-6 bg-card/80 backdrop-blur-xl border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerName')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className={`w-full bg-background dark:bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.customerName ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.enterYourName')}
            />
            {errors.customerName && (
              <p className="text-red-400 text-sm mt-1">{errors.customerName}</p>
            )}
          </div>

          {/* Customer Phone */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerPhone')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.customerPhone}
              onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
              className={`w-full bg-background dark:bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.customerPhone ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder="08xxxxxxxxxx"
            />
            {errors.customerPhone && (
              <p className="text-red-400 text-sm mt-1">{errors.customerPhone}</p>
            )}
          </div>

          {/* Customer Email */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerEmail')}
            </label>
            <input
              type="email"
              value={formData.customerEmail}
              onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
              className="w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              placeholder="email@example.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.subject')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className={`w-full bg-background dark:bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.subject ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.subjectPlaceholder')}
            />
            {errors.subject && (
              <p className="text-red-400 text-sm mt-1">{errors.subject}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.category')}
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="[color-scheme:light] dark:[color-scheme:dark] w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all dark:[&>option]:bg-slate-900 dark:[&>option]:text-cyan-100"
            >
              <option value="" className="dark:bg-slate-900 text-muted-foreground">{t('ticket.selectCategory')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="dark:bg-slate-900 dark:text-cyan-100">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.description')} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className={`w-full bg-background dark:bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all resize-none ${
                errors.description ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.descriptionPlaceholder')}
            />
            {errors.description && (
              <p className="text-red-400 text-sm mt-1">{errors.description}</p>
            )}
            <p className="text-muted-foreground text-sm mt-1">
              {t('ticket.minCharacters')}: 10
            </p>
          </div>

          {/* Location Tag */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              <MapPin size={14} className="inline mr-1" />
              Lokasi / Alamat Rumah
            </label>
            <input
              type="text"
              value={formData.locationTag}
              onChange={(e) => setFormData({ ...formData, locationTag: e.target.value })}
              className="w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              placeholder="Contoh: Jl. Merdeka No. 10, dekat warung Pak Budi"
            />

            {/* Coordinate inputs + action buttons */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Latitude</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  className="w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  placeholder="-5.147660"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Longitude</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  className="w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  placeholder="119.434700"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleGetGPS}
                disabled={gpsLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-cyan-500/40 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gpsLoading ? (
                  <><div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" /> Mendapatkan lokasi…</>
                ) : (
                  <><Navigation size={12} /> Ambil GPS Sekarang</>
                )}
              </button>
              {customerCoords.lat != null && customerCoords.lng != null && (
                <button
                  type="button"
                  onClick={handleUseCustomerCoords}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                >
                  <MapPinned size={12} /> Dari Data Pelanggan
                </button>
              )}
              {formData.latitude && formData.longitude && (
                <a
                  href={`https://maps.google.com/?q=${formData.latitude},${formData.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  📍 Lihat di Maps
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Opsional — membantu teknisi menemukan lokasi rumah Anda. Bisa diisi manual, ambil GPS, atau dari data pelanggan.
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              <Upload size={14} className="inline mr-1" />
              Lampiran (Foto / Dokumen)
            </label>
            <label
              className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-all ${
                uploading
                  ? 'border-cyan-400/60 bg-cyan-500/5 opacity-70'
                  : 'border-cyan-500/30 hover:border-cyan-500/50 hover:bg-cyan-500/5'
              }`}
            >
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-cyan-400">Mengupload…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload size={24} className="text-cyan-400/60" />
                  <span className="text-sm text-muted-foreground">
                    Klik untuk pilih file
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    JPG, PNG, WebP, PDF — maks 10MB per file
                  </span>
                </div>
              )}
            </label>

            {/* Uploaded files preview */}
            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-lg bg-background dark:bg-slate-900/50 border border-cyan-500/20"
                  >
                    {file.type === 'pdf' ? (
                      <FileText size={20} className="text-red-400 flex-shrink-0" />
                    ) : (
                      <ImageIcon size={20} className="text-cyan-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.type.toUpperCase()}</p>
                    </div>
                    {file.type !== 'pdf' && (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-10 h-10 object-cover rounded border border-border flex-shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors flex-shrink-0"
                      aria-label="Hapus file"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Opsional — lampirkan foto kerusakan, screenshot error, atau dokumen pendukung lainnya
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-2">
            <Link href="/customer/tickets">
              <CyberButton
                type="button"
                variant="outline"
                className="px-6 py-2.5"
              >
                {t('ticket.cancel')}
              </CyberButton>
            </Link>
            <CyberButton
              type="submit"
              disabled={loading}
              variant="cyan"
              className="px-6 py-2.5 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {t('ticket.creating')}...
                </>
              ) : (
                <>
                  <Send size={20} />
                  {t('ticket.submitTicket')}
                </>
              )}
            </CyberButton>
          </div>
        </form>
      </CyberCard>
    </div>
  );
}


